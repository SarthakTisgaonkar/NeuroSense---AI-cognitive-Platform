from datasets import load_dataset_builder, load_dataset

def analyze(dataset_id, is_streaming=True):
    print(f"--- Analyzing {dataset_id} ---")
    try:
        builder = load_dataset_builder(dataset_id)
        if builder.info.features:
            print("Features:", list(builder.info.features.keys()))
        else:
            print("Features: Mismatch/unavailable without loading")
        print("Splits:", list(builder.info.splits.keys()) if builder.info.splits else "Unknown splits")
    except Exception as e:
        print(f"Could not load builder for {dataset_id}: {e}")

    try:
        print("Fetching streaming sample...")
        ds = load_dataset(dataset_id, split="test", streaming=is_streaming)
        sample = next(iter(ds))
        if 'audio' in sample and isinstance(sample['audio'], dict):
            if 'array' in sample['audio']:
                shape = sample['audio']['array'].shape
                sample['audio']['array'] = f"<ARRAY SHAPE: {shape}>"
        print("Sample Data:")
        for k, v in sample.items():
            print(f"  {k}: {v}")
    except Exception as e:
        print(f"Error fetching sample: {e}")

analyze("ai4bharat/Svarah")
analyze("ai4bharat/IndicVoices", is_streaming=True)
