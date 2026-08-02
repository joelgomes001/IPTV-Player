import urllib.request
import urllib.parse
import json
import re
import time
import sys
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

LABELS = [
    "rejected:invalid_channel_id",
    "rejected:wrong_id",
    "rejected:channel_blocked"
]

M3U8_PATTERN = re.compile(r'https?://[^\s\'"<>\)]+?\.m3u8[^\s\'"<>\)]*')

def load_existing_channels(filepath):
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading {filepath}: {e}")
    return []

def clean_channel_name(title):
    name = re.sub(r'^(Add|Edit|Blocked):\s*', '', title, flags=re.IGNORECASE).strip()
    name = re.sub(r'\s*\([^)]*\)', '', name).strip()
    name = re.sub(r'\s*\[[^\]]*\]', '', name).strip()
    name = re.sub(r'\s+(SD|HD|FHD|4K|24/7)\b', '', name, flags=re.IGNORECASE).strip()
    return name if name else title.strip()

def infer_metadata(title, url):
    clean_name = clean_channel_name(title)
    nl = clean_name.lower()
    tl = title.lower()
    ul = url.lower()
    
    country = "International"
    genre = "General"
    
    # Doordarshan
    if 'dd ' in nl or nl.startswith('dd') or 'podhigai' in nl or 'yadagiri' in nl:
        country = "India"
        genre = "DD Channels"
    elif any(kw in nl for kw in ['somoy', 'star jalsha', 'zee', 'colors', 'sony', 'aaj tak', 'abp', 'republic', 'sun', 'bengali', 'tamil', 'telugu', 'malayalam', 'kannada', 'marathi', 'punjabi', 'gujarati', 'hindi', 'india']):
        country = "India"
        if any(kw in nl for kw in ['news', 'tak', 'ananda', 'tv9', 'samachar']):
            genre = "News"
        elif any(kw in nl for kw in ['cinema', 'movies', 'talkies', 'picture']):
            genre = "Movies"
        elif any(kw in nl for kw in ['sports']):
            genre = "Sports"
        elif any(kw in nl for kw in ['music', 'sangeet', 'beat']):
            genre = "Music"
        else:
            genre = "Entertainment"
    elif any(kw in nl for kw in ['sport', 'sports', 'deportes', 'match!']):
        genre = "Sports"
        if 'cyta' in nl or 'cytavision' in nl:
            country = "Cyprus"
        elif 'fox deportes' in nl:
            country = "United States"
        elif 'match' in nl:
            country = "Russia"
        elif 'eleven' in nl:
            country = "Poland"
    elif any(kw in nl for kw in ['news', 'bloomberg', 'cnbc', 'haber', 'noticias', 'tvn24']):
        genre = "News"
        if any(kw in nl for kw in ['cnbc', 'bloomberg', 'nbc news']):
            country = "United States"
        elif 'haber' in nl:
            country = "Turkey"
        elif 'noticias' in nl:
            country = "Latin America"
        elif 'tvn24' in nl:
            country = "Poland"
    elif any(kw in nl for kw in ['movie', 'movies', 'film', 'cinema', 'novelas', 'hallmark', 'tnt', 'amc', 'cinemax', 'moremax', 'tcm', 'shot tv']):
        genre = "Movies"
        if 'novelas' in nl or 'brazil' in tl:
            country = "Brazil"
        elif any(kw in nl for kw in ['hallmark', 'amc', 'cinemax', 'moremax', 'tcm']):
            country = "United States"
    elif any(kw in nl for kw in ['disney', 'cartoon', 'boomerang', 'dreamworks', 'karusel', 'zarok', 'ch4teen kids', 'jungle book']):
        genre = "Kids"
        if any(kw in nl for kw in ['disney', 'cartoon', 'boomerang', 'dreamworks']):
            country = "United States"
        elif 'karusel' in nl:
            country = "Russia"
    elif any(kw in nl for kw in ['discovery', 'travel', 'animal planet', 'crime', 'investigation', 'hgtv', 'home network']):
        genre = "Documentary"
        if any(kw in nl for kw in ['discovery', 'animal planet', 'hgtv']):
            country = "United States"

    if country == "International":
        if 'brazil' in tl or 'brasil' in tl:
            country = "Brazil"
        elif 'chile' in tl or '.cl/' in ul or 'chile' in ul:
            country = "Chile"
        elif 'bolivia' in tl or 'bolivia' in ul:
            country = "Bolivia"
        elif 'honduras' in tl or 'hn' in tl:
            country = "Honduras"
        elif 'russia' in tl or '.ru/' in ul:
            country = "Russia"
        elif 'turkey' in tl or 'türk' in tl or '.tr/' in ul:
            country = "Turkey"
        elif 'germany' in tl or 'wdr' in nl or '.de/' in ul:
            country = "Germany"
        elif 'france' in tl or '.fr/' in ul:
            country = "France"
        elif 'usa' in tl or 'us' in tl:
            country = "United States"

    clean_symbol = re.sub(r'[^a-zA-Z0-9]', '', clean_name).lower()
    logo_url = f"https://raw.githubusercontent.com/iptv-org/iptv/master/logos/{clean_symbol}.png"
    
    return {
        'name': clean_name,
        'country': country,
        'genre': genre,
        'thumbnail': logo_url
    }

def test_stream(item):
    url = item['url']
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=6) as res:
            if res.status in (200, 206):
                sample = res.read(300).decode('utf-8', errors='ignore')
                if '#EXTM3U' in sample or '#EXT-X-' in sample or res.status == 200:
                    return item
    except Exception:
        pass
    return None

def main():
    channels_path = 'channels.json'
    if not os.path.exists(channels_path) and os.path.exists('website/channels.json'):
        channels_path = 'website/channels.json'
        
    existing_channels = load_existing_channels(channels_path)
    existing_urls = set(c.get('stream_url', '').strip() for c in existing_channels if c.get('stream_url'))
    
    print(f"Loaded {len(existing_channels)} existing channels.")
    
    new_candidate_items = {}
    
    for label in LABELS:
        page = 1
        print(f"\n--- Fetching label: {label} ---")
        while True:
            encoded_label = urllib.parse.quote(label)
            url = f"https://api.github.com/repos/iptv-org/iptv/issues?state=closed&labels={encoded_label}&per_page=100&page={page}"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            try:
                with urllib.request.urlopen(req) as response:
                    data = json.loads(response.read().decode('utf-8', errors='ignore'))
                    if not data:
                        break
                    print(f"Page {page}: Received {len(data)} issues.")
                    for issue in data:
                        title = issue.get('title', '')
                        body = issue.get('body', '') or ''
                        issue_num = issue.get('number')
                        matches = M3U8_PATTERN.findall(body) + M3U8_PATTERN.findall(title)
                        for u in set(matches):
                            u_clean = u.rstrip('.,;()[]{}').strip()
                            if u_clean and u_clean not in existing_urls and u_clean not in new_candidate_items:
                                new_candidate_items[u_clean] = {
                                    'issue': issue_num,
                                    'title': title,
                                    'label': label,
                                    'url': u_clean
                                }
                    if len(data) < 100:
                        break
                    page += 1
                    time.sleep(0.5)
            except Exception as e:
                print(f"Error fetching page {page} for label {label}: {e}")
                break
                
    print(f"\nFound {len(new_candidate_items)} new unique candidate stream URLs to test.")
    
    if not new_candidate_items:
        print("No new streams found. Database is up to date!")
        return

    working_new_channels = []
    candidates_list = list(new_candidate_items.values())
    
    print(f"Testing {len(candidates_list)} candidates concurrently...")
    with ThreadPoolExecutor(max_workers=20) as executor:
        futures = [executor.submit(test_stream, item) for item in candidates_list]
        for future in as_completed(futures):
            res = future.result()
            if res:
                meta = infer_metadata(res['title'], res['url'])
                new_ch = {
                    "id": f"auto_{res['issue']}_{int(time.time())}_{len(working_new_channels)}",
                    "name": meta['name'],
                    "genre": meta['genre'],
                    "country": meta['country'],
                    "stream_url": res['url'],
                    "stream_from": "hls",
                    "thumbnail": meta['thumbnail'],
                    "poster": ""
                }
                working_new_channels.append(new_ch)
                print(f"[NEW WORKING STREAM] {meta['name']} ({meta['genre']} - {meta['country']}) -> {res['url']}")

    print(f"\nWeekly Sync Summary: Added {len(working_new_channels)} new active channels.")
    
    if working_new_channels:
        existing_channels.extend(working_new_channels)
        
        # Save to both channels.json locations if present
        with open('channels.json', 'w', encoding='utf-8') as f:
            json.dump(existing_channels, f, indent=2, ensure_ascii=False)
            
        if os.path.exists('website/channels.json'):
            with open('website/channels.json', 'w', encoding='utf-8') as f:
                json.dump(existing_channels, f, indent=2, ensure_ascii=False)
                
        print(f"Successfully saved {len(existing_channels)} total channels to database.")

if __name__ == '__main__':
    main()
