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

# Global Constants
RANA_API_URL = "https://flutter.fitdaddy.in/api/v100/all_tv_channel_by_category"
RANA_API_KEY = "rana_tv_key_2024"

REJECTED_LABELS = [
    "rejected:invalid_channel_id",
    "rejected:wrong_id",
    "rejected:channel_blocked"
]

M3U8_PATTERN = re.compile(r'https?://[^\s\'"<>\)]+?\.m3u8[^\s\'"<>\)]*')

# Comprehensive Country Detection Keywords
COUNTRY_KEYWORDS = {
    'India': ['india', 'hindi', 'tamil', 'telugu', 'kannada', 'malayalam', 'bengali', 'marathi', 'punjabi', 'gujarati', 'odia', 'assamese', 'urdu', 'bhojpuri', 'rajasthani', 'doordarshan', ' dd ', 'aaj tak', 'ndtv', 'zee ', 'star ', 'sony ', 'colors', 'sun tv', 'gemini', 'maa tv', 'asianet', 'surya', 'kairali', 'mathrubhumi', 'republic', 'abp', 'tv9', 'india today', 'wion', 'tata play', 'jio'],
    'United States': ['usa', 'america', 'nbc', 'cbs', 'abc', 'fox', 'cnn', 'msnbc', 'espn', 'hbo', 'showtime', 'starz', 'pbs', 'a&e', 'bravo', 'tlc', 'hgtv', 'food network', 'hallmark'],
    'United Kingdom': [' uk', 'bbc', 'itv', 'sky ', 'channel 4', 'channel 5', 'dave', 'e4'],
    'Bangladesh': ['bangla', 'bangladesh', 'btv', 'ntv', 'rtv', 'channel i', 'somoy', 'jamuna'],
    'Pakistan': ['pakistan', 'ary', 'geo ', 'hum ', 'bol ', 'express', 'ptv', 'samaa'],
    'Turkey': ['turkey', 'türk', 'trt ', 'kanal d', 'atv', 'star tv', 'show tv', 'fox tv'],
    'Germany': ['germany', 'german', 'deutsch', 'ard', 'zdf', 'rtl', 'sat.1', 'pro7', 'wdr', 'ndr', 'mdr', 'swr', 'br '],
    'France': ['france', 'french', 'tf1', 'france 2', 'france 3', 'arte', 'canal+', 'm6'],
    'Italy': ['italy', 'italian', 'rai ', 'mediaset', 'canale 5', 'italia'],
    'Spain': ['spain', 'spanish', 'espana', 'rtve', 'antena 3', 'telecinco', 'la sexta'],
    'Brazil': ['brazil', 'brasil', 'globo', 'sbt', 'record', 'band'],
    'Russia': ['russia', 'russian', 'первый', 'россия', 'нтв', 'рен', 'матч'],
    'China': ['china', 'chinese', 'cctv', 'cgtn', 'phoenix'],
    'Japan': ['japan', 'japanese', 'nhk', 'fuji', 'tbs'],
    'South Korea': ['korea', 'korean', 'kbs', 'mbc', 'sbs', 'arirang'],
    'Indonesia': ['indonesia', 'indonesian', 'tvri', 'rcti', 'sctv', 'trans', 'indosiar', 'metro tv', 'kompas'],
}

def clean_channel_name(title):
    name = re.sub(r'^(Add|Edit|Blocked):\s*', '', title, flags=re.IGNORECASE).strip()
    name = re.sub(r'\s*\([^)]*\)', '', name).strip()
    name = re.sub(r'\s*\[[^\]]*\]', '', name).strip()
    name = re.sub(r'\s+(SD|HD|FHD|4K|24/7)\b', '', name, flags=re.IGNORECASE).strip()
    return name if name else title.strip()

def detect_genre(name):
    nl = name.lower()
    if re.match(r'^dd\s', nl) or 'doordarshan' in nl:
        return 'DD Channels'
    if any(kw in nl for kw in ['news', 'haber', 'noticias', 'akhbar', 'khabar', 'samachar', 'times now', 'ndtv', 'cnn', 'bbc', 'al jazeera', 'cnbc', 'bloomberg', 'republic', 'aaj tak', 'abp', 'tv9', 'wion']):
        return 'News'
    if any(kw in nl for kw in ['sport', 'espn', 'cricket', 'football', 'soccer', 'nba', 'racing', 'star sports', 'sony ten', 'willow', 'fox sports', 'bein', 'match']):
        return 'Sports'
    if any(kw in nl for kw in ['disney', 'cartoon', 'nick', 'boomerang', 'pogo', 'hungama', 'sonic', 'dreamworks', 'cbeebies', 'karusel']):
        return 'Kids'
    if any(kw in nl for kw in ['music', 'mtv', 'vh1', 'vevo', 'radio', 'fm ', 'sangeet', 'hits', 'melody', 'zing']):
        return 'Music'
    if any(kw in nl for kw in ['movie', 'cinema', 'film', 'hbo', 'showtime', 'starz', 'cinemax', 'hallmark', 'lifetime', 'tcm', 'tnt', 'amc']):
        return 'Movies'
    if any(kw in nl for kw in ['discovery', 'natgeo', 'national geographic', 'animal planet', 'history', 'science', 'travel channel', 'investigation']):
        return 'Documentary'
    if any(kw in nl for kw in ['god', 'jesus', 'church', 'pray', 'quran', 'islamic', 'christian', 'hindu', 'sikh', 'aastha', 'sankara']):
        return 'Religious'
    if any(kw in nl for kw in ['shop', 'qvc', 'hsn']):
        return 'Shopping'
    if any(kw in nl for kw in ['education', 'university', 'school', 'swayam']):
        return 'Education'
    return 'Entertainment'

def detect_country(name, url=''):
    nl = name.lower() + ' ' + url.lower()
    for country, keywords in COUNTRY_KEYWORDS.items():
        for kw in keywords:
            if kw in nl:
                return country
    return 'International'

def test_stream(item):
    url = item['url']
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
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

def parse_m3u(text, default_country='International'):
    lines = text.split('\n')
    current_ext = None
    result = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if line.startswith('#EXTINF:'):
            current_ext = line
        elif not line.startswith('#') and current_ext:
            stream_url = line.strip()
            if stream_url:
                logo_match = re.search(r'tvg-logo="([^"]+)"', current_ext)
                logo = logo_match.group(1) if logo_match else ''
                title_idx = current_ext.rfind(',')
                name = current_ext[title_idx+1:].strip() if title_idx != -1 else 'Live Channel'
                if not name:
                    name = 'Live Channel'
                result.append({
                    'name': name,
                    'stream_url': stream_url,
                    'thumbnail': logo
                })
            current_ext = None
    return result

def main():
    channels_file = 'channels.json'
    if not os.path.exists(channels_file) and os.path.exists('website/channels.json'):
        channels_file = 'website/channels.json'

    print(f"Loading master database from {channels_file}...")
    with open(channels_file, 'r', encoding='utf-8') as f:
        channels = json.load(f)

    # Index existing channels by URL and by Name
    url_map = {}
    name_map = {}

    for c in channels:
        u = c.get('stream_url', '').strip()
        n = c.get('name', '').strip().lower()
        if u:
            url_map[u] = c
        if n:
            name_map[n] = c

    print(f"Master Database loaded: {len(channels)} channels.")

    urls_updated = 0
    new_added = 0

    # 1. Sync with Rana's API
    print("\n[1/4] Syncing with Rana's API Server...")
    try:
        req = urllib.request.Request(RANA_API_URL, headers={'API-KEY': RANA_API_KEY, 'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as res:
            cat_data = json.loads(res.read().decode('utf-8', errors='ignore'))
            if isinstance(cat_data, list):
                for cat in cat_data:
                    cat_title = (cat.get('title') or 'General').strip()
                    for ch in cat.get('channels') or []:
                        s_url = (ch.get('stream_url') or '').strip()
                        raw_name = (ch.get('tv_name') or '').strip()
                        if not s_url or not raw_name:
                            continue
                        c_name_lower = raw_name.lower()
                        
                        if s_url in url_map:
                            # Already exists by URL, preserve custom genre/country if already set
                            existing = url_map[s_url]
                            if existing.get('genre') in ('General', '', None):
                                existing['genre'] = cat_title
                        elif c_name_lower in name_map:
                            # Stream URL updated for existing channel!
                            existing = name_map[c_name_lower]
                            old_url = existing.get('stream_url')
                            if old_url in url_map:
                                del url_map[old_url]
                            existing['stream_url'] = s_url
                            url_map[s_url] = existing
                            urls_updated += 1
                        else:
                            # Brand new channel
                            raw_thumb = ch.get('thumbnail_url') or ''
                            new_ch = {
                                "id": f"rana_{ch.get('live_tv_id') or int(time.time())}",
                                "name": raw_name,
                                "genre": detect_genre(raw_name),
                                "country": "India",
                                "stream_url": s_url,
                                "stream_from": ch.get('stream_from') or 'hls',
                                "thumbnail": raw_thumb if raw_thumb and 'tv_thumbnail.jpg' not in raw_thumb else '',
                                "poster": ch.get('poster_url') or ''
                            }
                            channels.append(new_ch)
                            url_map[s_url] = new_ch
                            name_map[c_name_lower] = new_ch
                            new_added += 1
    except Exception as e:
        print(f"Rana API Sync notice: {e}")

    # 2. Sync with IPTV-Org India M3U
    print("\n[2/4] Syncing with IPTV-Org India M3U...")
    try:
        req = urllib.request.Request('https://iptv-org.github.io/iptv/countries/in.m3u', headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as res:
            parsed = parse_m3u(res.read().decode('utf-8', errors='ignore'))
            for c in parsed:
                s_url = c['stream_url'].strip()
                c_name_lower = c['name'].strip().lower()
                if s_url in url_map:
                    continue
                elif c_name_lower in name_map:
                    existing = name_map[c_name_lower]
                    old_url = existing.get('stream_url')
                    if old_url in url_map:
                        del url_map[old_url]
                    existing['stream_url'] = s_url
                    url_map[s_url] = existing
                    urls_updated += 1
                else:
                    new_ch = {
                        "id": f"iptv_in_{int(time.time())}_{new_added}",
                        "name": c['name'],
                        "genre": detect_genre(c['name']),
                        "country": "India",
                        "stream_url": s_url,
                        "stream_from": "youtube" if "youtube" in s_url or "youtu.be" in s_url else "hls",
                        "thumbnail": c['thumbnail'],
                        "poster": ""
                    }
                    channels.append(new_ch)
                    url_map[s_url] = new_ch
                    name_map[c_name_lower] = new_ch
                    new_added += 1
    except Exception as e:
        print(f"IPTV-Org India M3U notice: {e}")

    # 3. Sync with IPTV-Org Global Index M3U
    print("\n[3/4] Syncing with IPTV-Org Global Index M3U...")
    try:
        req = urllib.request.Request('https://iptv-org.github.io/iptv/index.m3u', headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=60) as res:
            parsed = parse_m3u(res.read().decode('utf-8', errors='ignore'))
            for c in parsed:
                s_url = c['stream_url'].strip()
                c_name_lower = c['name'].strip().lower()
                if s_url in url_map:
                    continue
                elif c_name_lower in name_map:
                    existing = name_map[c_name_lower]
                    old_url = existing.get('stream_url')
                    if old_url in url_map:
                        del url_map[old_url]
                    existing['stream_url'] = s_url
                    url_map[s_url] = existing
                    urls_updated += 1
                else:
                    new_ch = {
                        "id": f"iptv_global_{int(time.time())}_{new_added}",
                        "name": c['name'],
                        "genre": detect_genre(c['name']),
                        "country": detect_country(c['name'], s_url),
                        "stream_url": s_url,
                        "stream_from": "youtube" if "youtube" in s_url or "youtu.be" in s_url else "hls",
                        "thumbnail": c['thumbnail'],
                        "poster": ""
                    }
                    channels.append(new_ch)
                    url_map[s_url] = new_ch
                    name_map[c_name_lower] = new_ch
                    new_added += 1
    except Exception as e:
        print(f"IPTV-Org Global M3U notice: {e}")

    # 4. Sync Rejected Issues (Treasure Hunt)
    print("\n[4/4] Searching IPTV-Org Rejected Issues for hidden stream URLs...")
    rejected_candidates = {}
    for label in REJECTED_LABELS:
        page = 1
        while True:
            encoded_label = urllib.parse.quote(label)
            url = f"https://api.github.com/repos/iptv-org/iptv/issues?state=closed&labels={encoded_label}&per_page=100&page={page}"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            try:
                with urllib.request.urlopen(req) as response:
                    data = json.loads(response.read().decode('utf-8', errors='ignore'))
                    if not data:
                        break
                    for issue in data:
                        title = issue.get('title', '')
                        body = issue.get('body', '') or ''
                        issue_num = issue.get('number')
                        matches = M3U8_PATTERN.findall(body) + M3U8_PATTERN.findall(title)
                        for u in set(matches):
                            u_clean = u.rstrip('.,;()[]{}').strip()
                            if u_clean and u_clean not in url_map and u_clean not in rejected_candidates:
                                rejected_candidates[u_clean] = {
                                    'issue': issue_num,
                                    'title': title,
                                    'url': u_clean
                                }
                    if len(data) < 100:
                        break
                    page += 1
                    time.sleep(0.3)
            except Exception:
                break

    if rejected_candidates:
        print(f"Testing {len(rejected_candidates)} candidate stream URLs from rejected issues...")
        candidates_list = list(rejected_candidates.values())
        with ThreadPoolExecutor(max_workers=20) as executor:
            futures = [executor.submit(test_stream, item) for item in candidates_list]
            for future in as_completed(futures):
                res = future.result()
                if res:
                    clean_name = clean_channel_name(res['title'])
                    clean_symbol = re.sub(r'[^a-zA-Z0-9]', '', clean_name).lower()
                    logo_url = f"https://raw.githubusercontent.com/iptv-org/iptv/master/logos/{clean_symbol}.png"
                    new_ch = {
                        "id": f"rej_{res['issue']}_{int(time.time())}_{new_added}",
                        "name": clean_name,
                        "genre": detect_genre(clean_name),
                        "country": detect_country(clean_name, res['url']),
                        "stream_url": res['url'],
                        "stream_from": "hls",
                        "thumbnail": logo_url,
                        "poster": ""
                    }
                    channels.append(new_ch)
                    url_map[res['url']] = new_ch
                    name_map[clean_name.lower()] = new_ch
                    new_added += 1

    print(f"\n==========================================")
    print(f"SYNC SUMMARY:")
    print(f" - Updated Stream URLs: {urls_updated}")
    print(f" - New Active Channels Added: {new_added}")
    print(f" - Total Database Size: {len(channels)} channels")
    print(f"==========================================")

    # Save to both channels.json locations
    with open('channels.json', 'w', encoding='utf-8') as f:
        json.dump(channels, f, indent=2, ensure_ascii=False)
        
    if os.path.exists('website/channels.json'):
        with open('website/channels.json', 'w', encoding='utf-8') as f:
            json.dump(channels, f, indent=2, ensure_ascii=False)

    # Generate master playlist.m3u for VLC and IPTV players
    m3u_lines = ["#EXTM3U"]
    for idx, ch in enumerate(channels, 1):
        name = ch.get('name', 'Live Channel').strip()
        genre = ch.get('genre', 'General').strip()
        country = ch.get('country', 'International').strip()
        logo = ch.get('thumbnail', '').strip()
        url = ch.get('stream_url', '').strip()
        if not url:
            continue
        group_title = f"{country} - {genre}" if country != "International" else genre
        extinf = f'#EXTINF:-1 tvg-id="{ch.get("id", idx)}" tvg-name="{name}" tvg-logo="{logo}" group-title="{group_title}",{name}'
        m3u_lines.append(extinf)
        m3u_lines.append(url)

    m3u_content = "\n".join(m3u_lines)
    with open('playlist.m3u', 'w', encoding='utf-8') as f:
        f.write(m3u_content)
    if os.path.exists('website'):
        with open('website/playlist.m3u', 'w', encoding='utf-8') as f:
            f.write(m3u_content)
    print("Master playlist.m3u generated successfully!")

if __name__ == '__main__':
    main()
