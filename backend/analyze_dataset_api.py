import requests
import json

def fetch_info(dataset):
    print(f"--- Info for {dataset} ---")
    url = f"https://datasets-server.huggingface.co/info?dataset={dataset}"
    r = requests.get(url)
    if r.status_code == 200:
        data = r.json()
        print("Dataset Info Keys:", data.keys())
        if 'dataset_info' in data:
            for config, info in data['dataset_info'].items():
                print(f"Config: {config}")
                print("Features:", list(info.get('features', {}).keys()))
                splits = info.get('splits', {})
                print("Splits:", {k: v.get('num_examples') for k, v in splits.items()})
    else:
        print(f"Error: {r.status_code} {r.text}")

def fetch_first_row(dataset, config="default", split="test"):
    print(f"--- First row for {dataset} ---")
    url = f"https://datasets-server.huggingface.co/first-rows?dataset={dataset}&config={config}&split={split}"
    r = requests.get(url)
    if r.status_code == 200:
        data = r.json()
        if 'rows' in data and len(data['rows']) > 0:
            row = data['rows'][0]['row']
            print("First row keys:", row.keys())
            for k, v in row.items():
                if isinstance(v, dict) and 'bytes' in v:
                    print(f"  {k}: <audio/dict data length {len(v['bytes']) if v['bytes'] else 'None'}>")
                else:
                    print(f"  {k}: {v}")
    else:
        print(f"Error: {r.status_code} {r.text}")

fetch_info("ai4bharat/Svarah")
fetch_first_row("ai4bharat/Svarah", config="default", split="test")

fetch_info("ai4bharat/IndicVoices")
fetch_first_row("ai4bharat/IndicVoices", config="default", split="test")
