"""
State-of-the-Art Parkinson's Spiral Detection Model
Architecture: DenseNet121 with Fine-Tuning
Key Feature: Adaptive Binarization (Eliminates paper background/shadow domain shift)
Target Accuracy: > 99.0%
"""

import os
import cv2
import numpy as np
import tensorflow as tf
from tensorflow.keras.applications import DenseNet121
from tensorflow.keras.models import Model
from tensorflow.keras.layers import Dense, GlobalAveragePooling2D, Dropout, BatchNormalization
from tensorflow.keras.preprocessing.image import ImageDataGenerator
from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint, ReduceLROnPlateau
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score
import matplotlib.pyplot as plt

# ==========================================
# 1. ROBUST IMAGE PREPROCESSING (THE FIX)
# ==========================================
def extract_spiral_stroke(image):
    """
    This function completely destroys paper textures, shadows, and ink colors.
    It forces the image to be a pure white background with a pure black stroke.
    This MUST be applied during training so the model learns geometry, not paper color.
    """
    # 1. Convert to grayscale
    # (ImageDataGenerator passes images as floats in [0, 255], convert to np.uint8)
    img_uint8 = np.clip(image, 0, 255).astype(np.uint8)
    if len(img_uint8.shape) == 3 and img_uint8.shape[2] == 3:
        gray = cv2.cvtColor(img_uint8, cv2.COLOR_RGB2GRAY)
    elif len(img_uint8.shape) == 3 and img_uint8.shape[2] == 4:
        # Handle Alpha Channel (RGBA)
        alpha_channel = img_uint8[:, :, 3]
        rgb_channels = img_uint8[:, :, :3]
        white_background = np.ones_like(rgb_channels, dtype=np.uint8) * 255
        alpha_factor = alpha_channel[:, :, np.newaxis] / 255.0
        blended = (rgb_channels * alpha_factor + white_background * (1 - alpha_factor)).astype(np.uint8)
        gray = cv2.cvtColor(blended, cv2.COLOR_RGB2GRAY)
    else:
        gray = img_uint8
        
    # 2. CLAHE (Contrast Limited Adaptive Histogram Equalization)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
    enhanced = clahe.apply(gray)
    
    # 3. Gaussian Blur to remove paper grain and minor noise
    blurred = cv2.GaussianBlur(enhanced, (5, 5), 0)
    
    # 4. Otsu's Thresholding: Automatically finds perfect threshold to extract ink
    _, binary_ink = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    
    # 5. Morphological Closing: Connects broken pen strokes and smooths jagged ink bleed
    kernel = np.ones((3, 3), np.uint8)
    smoothed = cv2.morphologyEx(binary_ink, cv2.MORPH_CLOSE, kernel)
    
    # 6. SYNTHETIC CONTOUR RECONSTRUCTION
    # Finds the absolute mathematical path of the ink
    contours, _ = cv2.findContours(smoothed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    img_size = (224, 224)
    # Create empty white canvas (Background = White (255), Ink will be Black (0) matching standard datasets)
    canvas = np.ones((img_size[1], img_size[0]), dtype=np.uint8) * 255
    
    if contours:
        # Find exact bounding box of the physical drawing
        all_points = np.vstack(contours)
        x, y, w, h = cv2.boundingRect(all_points)
        
        # Scale to fit exactly in the 224x224 canvas with padding
        padding = 10
        scale = min((img_size[0] - 2 * padding) / max(w, 1), (img_size[1] - 2 * padding) / max(h, 1))
        
        offset_x = (img_size[0] - w * scale) / 2 - x * scale
        offset_y = (img_size[1] - h * scale) / 2 - y * scale
        
        scaled_contours = []
        for c in contours:
            scaled_c = np.copy(c)
            scaled_c[:, 0, 0] = np.round(c[:, 0, 0] * scale + offset_x).astype(np.int32)
            scaled_c[:, 0, 1] = np.round(c[:, 0, 1] * scale + offset_y).astype(np.int32)
            scaled_contours.append(scaled_c)
            
        # Draw perfectly smooth, anti-aliased black lines of fixed thickness on the white canvas, destroying aliasing jaggies
        cv2.drawContours(canvas, scaled_contours, -1, 0, thickness=2, lineType=cv2.LINE_AA)
        
    # 7. Convert to 3-channel RGB (Required by DenseNet121)
    img_standardized = cv2.cvtColor(canvas, cv2.COLOR_GRAY2RGB)
    
    return img_standardized.astype(np.float32)

# ==========================================
# 2. DATA GENERATORS WITH AUGMENTATION
# ==========================================
def setup_data_generators(dataset_dirs, batch_size=32, img_size=(224, 224)):
    print("[INFO] Initializing Data Generators with Strict Binarization...")
    
    # Heavy augmentation for training to prevent overfitting on small datasets
    train_datagen = ImageDataGenerator(
        preprocessing_function=extract_spiral_stroke,
        rescale=1./255,
        rotation_range=360,      # Spirals can be rotated any amount
        width_shift_range=0.1,   # Shift to handle off-center drawings
        height_shift_range=0.1,
        zoom_range=[0.8, 1.2],   # Scale variations
        horizontal_flip=True,
        vertical_flip=True,
        fill_mode='constant',
        cval=255,                # Fill empty space with white
        validation_split=0.2
    )
    
    # Validation strictly preprocesses but DOES NOT augment
    val_datagen = ImageDataGenerator(
        preprocessing_function=extract_spiral_stroke,
        rescale=1./255,
        validation_split=0.2
    )
    
    # We consolidate to the first available directory for simplicity given standard Keras generator limits
    # Multi-generator handling typically requires custom Sequences, simplified here to the root folder
    first_valid_dir = dataset_dirs[0] if isinstance(dataset_dirs, list) else dataset_dirs
    
    # Ensure consistent mapping: 0=Control/Healthy, 1=PD/Parkinson regardless of directory alphabetical order
    # Keras flow_from_directory classes list forces this strict order
    # If the directories are named 'Control' and 'PD'
    classes_explicit = ['Control', 'PD'] 
    
    # If directories use different semantic names, a try/except or os.listdir logic would be needed,
    # but based on previous code we expect 'Control' and 'PD'
    
    train_gen = train_datagen.flow_from_directory(
        first_valid_dir,
        target_size=img_size,
        batch_size=batch_size,
        classes=classes_explicit,
        class_mode='binary',
        subset='training',
        shuffle=True
    )
    
    val_gen = val_datagen.flow_from_directory(
        first_valid_dir,
        target_size=img_size,
        batch_size=batch_size,
        classes=classes_explicit,
        class_mode='binary',
        subset='validation',
        shuffle=False
    )
    
    return train_gen, val_gen

# ==========================================
# 3. ADVANCED ARCHITECTURE (DenseNet121)
# ==========================================
def build_optimized_model(input_shape=(224, 224, 3)):
    print("[INFO] Building DenseNet121 Architecture...")
    
    # DenseNet121 is highly effective for medical imaging due to feature reuse
    base_model = DenseNet121(weights='imagenet', include_top=False, input_shape=input_shape)
    
    # Phase 1: Freeze the base model to train the top classifier first
    base_model.trainable = False
    
    x = base_model.output
    
    # Dual Pooling: Captures overall shape (Average) and sharp tremors (Max)
    from tensorflow.keras.layers import GlobalMaxPooling2D, Concatenate
    
    avg_pool = GlobalAveragePooling2D()(x)
    max_pool = GlobalMaxPooling2D()(x)
    merged = Concatenate()([avg_pool, max_pool])
    
    x = BatchNormalization()(merged)
    x = Dropout(0.5)(x) # High dropout to prevent memorizing the small dataset
    x = Dense(256, activation='relu')(x)
    x = BatchNormalization()(x)
    x = Dropout(0.3)(x)
    predictions = Dense(1, activation='sigmoid')(x)
    
    model = Model(inputs=base_model.input, outputs=predictions)
    
    # Use Adam optimizer with a conservative learning rate
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
        loss='binary_crossentropy',
        metrics=['accuracy', tf.keras.metrics.AUC(name='auc')]
    )
    
    return model, base_model

# ==========================================
# 4. TWO-PHASE TRAINING STRATEGY
# ==========================================
def train_model(model, base_model, train_gen, val_gen):
    # Phase 1: Train only the classification head
    print("\n[INFO] Phase 1: Training Classification Head...")
    callbacks_p1 = [
        EarlyStopping(monitor='val_loss', patience=5, restore_best_weights=True),
        ModelCheckpoint('best_parkinsons_model_phase1.h5', monitor='val_auc', save_best_only=True, mode='max')
    ]
    
    model.fit(
        train_gen,
        validation_data=val_gen,
        epochs=30, # Increased phase 1 epochs for better stable base head convergence
        callbacks=callbacks_p1
    )
    
    # Phase 2: Fine-Tuning (Unfreeze the top blocks of DenseNet)
    print("\n[INFO] Phase 2: Fine-Tuning Top Convolutional Blocks...")
    base_model.trainable = True
    
    # Freeze the bottom 70% of layers, unfreeze the top 30% for domain-specific feature learning
    fine_tune_at = int(len(base_model.layers) * 0.7)
    for layer in base_model.layers[:fine_tune_at]:
        layer.trainable = False
        
    # Recompile with a drastically lower learning rate
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=1e-5), 
        loss='binary_crossentropy',
        metrics=['accuracy', tf.keras.metrics.AUC(name='auc')]
    )
    
    callbacks_p2 = [
        EarlyStopping(monitor='val_auc', patience=10, restore_best_weights=True, mode='max'),
        ReduceLROnPlateau(monitor='val_loss', factor=0.2, patience=3, min_lr=1e-7),
        ModelCheckpoint('best_parkinsons_model_final.h5', monitor='val_auc', save_best_only=True, mode='max')
    ]
    
    history = model.fit(
        train_gen,
        validation_data=val_gen,
        epochs=60, # Increased phase 2 epochs for higher max accuracy ceiling
        callbacks=callbacks_p2
    )
    
    return model, history

# ==========================================
# 5. EXECUTION PIPELINE
# ==========================================
if __name__ == "__main__":
    # Ensure dataset folder has two subfolders: "PD" and "Control"
    DATASET_DIRS = [
        "./dataset_newhandpd",
        "./dataset_handpd", 
        "./dataset_mader"
    ]
    
    valid_dirs = [d for d in DATASET_DIRS if os.path.exists(d)]
    
    if valid_dirs:
        # 1. Setup Generators
        train_gen, val_gen = setup_data_generators(valid_dirs)
        
        if train_gen.samples > 0 and val_gen.samples > 0:
            # 2. Build Model
            model, base_model = build_optimized_model()
            
            # 3. Train
            model, history = train_model(model, base_model, train_gen, val_gen)
            
            # 4. Final Evaluation
            print("\n[INFO] Evaluating Final Model on Validation Set...")
            val_gen.reset()
            y_pred_probs = model.predict(val_gen)
            y_pred = (y_pred_probs > 0.5).astype(int).flatten()
            y_true = val_gen.classes
            
            print("\nClassification Report:")
            print(classification_report(y_true, y_pred, target_names=val_gen.class_indices.keys()))
            
            print(f"Final ROC-AUC Score: {roc_auc_score(y_true, y_pred_probs):.4f}")
            print("\n[SUCCESS] Model saved as 'best_parkinsons_model_final.h5'")
            
            # Export to TFLite
            converter = tf.lite.TFLiteConverter.from_keras_model(model)
            tflite_model = converter.convert()
            with open('best_parkinsons_model.tflite', 'wb') as f:
                f.write(tflite_model)
            print("[SUCCESS] Exported to TFLite format.")
            
        else:
             print("[ERROR] Found directories, but no viable images located within structure.")
    else:
        print(f"[ERROR] No valid dataset directories found in {DATASET_DIRS}.")
