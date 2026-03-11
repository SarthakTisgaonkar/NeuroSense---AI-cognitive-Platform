"""
Convert the Keras .h5 model to TensorFlow.js LayersModel format.
Outputs to: public/tfjs_model/
"""
import os
import json
import struct
import numpy as np
import tensorflow as tf
from tensorflow.keras.models import load_model

MODEL_PATH = 'parkinson_disease_detection.h5'
OUTPUT_DIR = os.path.join('public', 'tfjs_model')

os.makedirs(OUTPUT_DIR, exist_ok=True)

print(f"Loading model from {MODEL_PATH}...")
model = load_model(MODEL_PATH)
model.summary()

# Build the model topology JSON
topology = json.loads(model.to_json())

# Extract weights
weights_manifest = []
weight_data = bytearray()

for layer in model.layers:
    layer_weights = layer.get_weights()
    for i, w in enumerate(layer_weights):
        w = w.astype(np.float32)
        name = f"{layer.name}/{layer.weights[i].name}"
        weight_entry = {
            "name": name,
            "shape": list(w.shape),
            "dtype": "float32"
        }
        weights_manifest.append(weight_entry)
        weight_data.extend(w.tobytes())

# Write binary weights file
weights_bin_path = os.path.join(OUTPUT_DIR, 'group1-shard1of1.bin')
with open(weights_bin_path, 'wb') as f:
    f.write(bytes(weight_data))

print(f"Weights written: {len(weight_data)} bytes -> {weights_bin_path}")

# Write model.json
model_json = {
    "format": "layers-model",
    "generatedBy": "manual-converter",
    "convertedBy": None,
    "modelTopology": topology,
    "weightsManifest": [{
        "paths": ["group1-shard1of1.bin"],
        "weights": weights_manifest
    }]
}

model_json_path = os.path.join(OUTPUT_DIR, 'model.json')
with open(model_json_path, 'w') as f:
    json.dump(model_json, f)

print(f"Model JSON written: {model_json_path}")
print("Conversion complete! Model files are in public/tfjs_model/")
