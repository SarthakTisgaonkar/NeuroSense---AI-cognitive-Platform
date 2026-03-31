import tensorflow as tf
from tensorflow.keras.applications import VGG16
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Flatten, Dense, Dropout

print("Building VGG16 Architecture...")
img_size = 224
base_model = VGG16(input_shape=(img_size, img_size, 3), include_top=False, weights=None)

model = Sequential([
    base_model,
    Flatten(),
    Dense(128, activation='relu'),
    Dropout(0.5),
    Dense(1, activation='sigmoid')
])

print("Architecture built.")
model.summary()

print("Loading weights from spiral_model.h5...")
try:
    model.load_weights("spiral_model.h5")
    print("Weights loaded successfully!")
    
    print("Saving cleanly as spiral_model_fixed.keras...")
    model.save("spiral_model_fixed.keras")
    print("Saved successfully!")
except Exception as e:
    print(f"Error loading weights: {e}")
