import os
import argparse
import soundfile as sf
import librosa
from datasets import load_dataset
from tqdm import tqdm

def ingest_svarah(hf_token, num_samples, out_dir, split="test"):
    if not os.path.exists(out_dir):
        os.makedirs(out_dir)

    print(f"Connecting to Hugging Face to stream {num_samples} samples from 'ai4bharat/Svarah' ({split} split)...")
    
    try:
        # We use streaming=True so we don't have to download the entire multi-GB dataset locally all at once.
        dataset = load_dataset("ai4bharat/Svarah", split=split, streaming=True, token=hf_token)
    except Exception as e:
        print(f"Error accessing dataset: {e}")
        print("Please ensure your HF_TOKEN is valid and that you have accepted the dataset terms on the Hugging Face website.")
        return

    saved_count = 0
    iterator = iter(dataset)
    
    # We'll use tqdm for a nice loading bar
    with tqdm(total=num_samples) as pbar:
        while saved_count < num_samples:
            try:
                sample = next(iterator)
            except StopIteration:
                print("No more samples in the split.")
                break
                
            audio_data = sample.get('audio')
            if audio_data is None:
                continue
                
            audio_array = audio_data.get('array')
            original_sr = audio_data.get('sampling_rate')
            
            if audio_array is None or original_sr is None:
                continue

            # Resample to 22050 Hz to match our existing Parkinson model architecture
            target_sr = 22050
            if original_sr != target_sr:
                audio_array = librosa.resample(audio_array, orig_sr=original_sr, target_sr=target_sr)
                
            filename = os.path.join(out_dir, f"svarah_{split}_{saved_count:04d}.wav")
            # Save using soundfile
            sf.write(filename, audio_array, target_sr)
            
            saved_count += 1
            pbar.update(1)

    print(f"\nSuccessfully downloaded and processed {saved_count} audio files into '{out_dir}'.")
    print("These samples represent healthy Indian English speech accents and will dramatically improve model robustness.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest the Svarah Indian Accent Dataset for Parkinson's model robustness.")
    parser.add_argument("--hf_token", type=str, required=True, help="Your Hugging Face API access token (hf_...)")
    parser.add_argument("--num_samples", type=int, default=500, help="Number of samples to ingest (default: 500)")
    parser.add_argument("--out_dir", type=str, default="dataset/healthy", help="Output directory to save the wav files")
    parser.add_argument("--split", type=str, default="test", help="Which dataset split to pull from (train, test, validation)")
    
    args = parser.parse_args()
    ingest_svarah(args.hf_token, args.num_samples, args.out_dir, args.split)
