import os
from app import preprocess_audio_for_cnn

try:
    test_file = r'D:\Internship\Pd\Parkinson 10 07 2025\sanchit.wav'
    with open(test_file, 'rb') as f:
        bytes_data = f.read()
        
    print("Testing FFMPEG subprocess conversion locally...")
    features = preprocess_audio_for_cnn(bytes_data, original_filename='sanchit.wav')
    print(f"Success! Features shape: {features.shape}")
        
except Exception as e:
    print(f"Error testing backend preprocess script: {e}")
