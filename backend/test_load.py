import os
from tensorflow.keras.models import load_model

try:
    print("Loading spiral_model.h5...")
    model = load_model('spiral_model.h5')
    print("Model loaded successfully!")
    print(f"Input shape: {model.input_shape}")
    print(f"Output shape: {model.output_shape}")
except Exception as e:
    print(f"Error: {e}")
