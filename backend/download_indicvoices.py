import os
import requests
import tarfile
from tqdm import tqdm

def download_and_extract_indicvoices(url, dest_dir, max_files=500):
    if not os.path.exists(dest_dir):
        os.makedirs(dest_dir)

    filename = url.split('/')[-1]
    tgz_path = os.path.join(dest_dir, filename)

    print(f"Downloading IndicVoices dataset from {url}...")
    
    # Download the file
    response = requests.get(url, stream=True)
    response.raise_for_status()
    total_size = int(response.headers.get('content-length', 0))
    
    with open(tgz_path, 'wb') as file, tqdm(
        desc=filename,
        total=total_size,
        unit='B',
        unit_scale=True,
        unit_divisor=1024,
    ) as bar:
        for data in response.iter_content(chunk_size=1024):
            size = file.write(data)
            bar.update(size)

    print(f"\nDownload complete. Extracting maximum {max_files} files to {dest_dir}...")
    
    # Extract the tarball
    extracted_count = 0
    with tarfile.open(tgz_path, "r:gz") as tar:
        for member in tqdm(tar.getmembers(), desc="Extracting"):
            if member.isfile() and member.name.endswith('.wav'):
                # Extract file into the destination directory flatly
                member.name = os.path.basename(member.name)
                tar.extract(member, dest_dir)
                extracted_count += 1
                if extracted_count >= max_files:
                    break
    
    print(f"Extraction complete. {extracted_count} .wav files saved to {dest_dir}.")
    print("Consider removing the heavy .tgz file to save disk space:")
    print(f"    del \"{tgz_path}\"")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Download and extract raw IndicVoices `.tgz` dataset.")
    parser.add_argument("--url", type=str, default="https://iv-release.objectstore.e2enetworks.net/dmu_release/v1_Hindi_train.tgz", help="Direct URL to .tgz file")
    parser.add_argument("--dest_dir", type=str, default="dataset/healthy", help="Directory to extract the files")
    parser.add_argument("--max_files", type=int, default=500, help="Maximum number of audio files to extract")
    
    args = parser.parse_args()
    download_and_extract_indicvoices(args.url, args.dest_dir, args.max_files)
