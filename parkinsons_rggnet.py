"""
Parkinson's Disease Detection from Spiral Images
RGG-Net (ResNet50 + InceptionV3) Multi-Dataset Pipeline

Phase 2: Multi-Dataset Acquisition & Preprocessing
Phase 3: Data Preprocessing
Phase 4: Model Architecture (RGG-Net)
Phase 5: Multi-Dataset Training Strategy
Phase 6: Evaluation Across All Datasets
Phase 7: Explainability (XAI) Integration (Grad-CAM)
Phase 8: Export & Deployment (.h5, TFLite)
"""

import os
import numpy as np
import tensorflow as tf
from tensorflow.keras.preprocessing.image import ImageDataGenerator
from tensorflow.keras.applications import ResNet50, InceptionV3
from tensorflow.keras.layers import Input, GlobalAveragePooling2D, Concatenate, Dropout, Dense
from tensorflow.keras.models import Model
from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint, ReduceLROnPlateau
from tensorflow.keras.preprocessing import image
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score, f1_score, accuracy_score
import matplotlib.pyplot as plt
import cv2

# ==========================================
# PHASE 2 & 3: MULTI-DATASET & PREPROCESSING
# ==========================================

# Example directory paths (to be adjusted based on actual environment)
DATA_DIRS = {
    'NewHandPD': 'dataset/NewHandPD',
    'HandPD': 'dataset/HandPD',
    'Mader': 'dataset/Mader',
    'UCI': 'dataset/UCISpiral', # Kept mainly for validation/testing
    'PatientsData': 'dataset/PatientsData' # Specific real-world clinical patients data for comparison
}

# Image Preprocessing and Augmentation rules:
# Rotation (±15°), Zoom (0.9–1.1), Flip (horizontal/vertical), Brightness variation
train_datagen = ImageDataGenerator(
    rescale=1./255,
    rotation_range=15,
    zoom_range=[0.9, 1.1],
    horizontal_flip=True,
    vertical_flip=True,
    brightness_range=[0.8, 1.2],
    fill_mode='nearest'
)

# Test/Val data should ONLY be rescaled, not augmented
val_datagen = ImageDataGenerator(rescale=1./255)

BATCH_SIZE = 32
TARGET_SIZE = (224, 224)

def safe_flow_from_directory(directory, datagen, batch_size, subset_name="train", shuffle=True):
    path = os.path.join(directory, subset_name)
    if not os.path.exists(path):
        print(f"Warning: Directory {path} not found. Returning empty generator equivalent.")
        return None
    
    return datagen.flow_from_directory(
        path,
        target_size=TARGET_SIZE,
        batch_size=batch_size,
        class_mode='binary',
        shuffle=shuffle
    )

# Loading multi-dataset streams
# We allocate 1/3 of the batch size to each to ensure a balanced, generalized diet per step.
newhand_gen = safe_flow_from_directory(DATA_DIRS['NewHandPD'], train_datagen, batch_size=BATCH_SIZE // 3)
handpd_gen  = safe_flow_from_directory(DATA_DIRS['HandPD'], train_datagen, batch_size=BATCH_SIZE // 3)
mader_gen   = safe_flow_from_directory(DATA_DIRS['Mader'], train_datagen, batch_size=BATCH_SIZE // 3)

# ==========================================
# PHASE 5: MULTI-DATASET TRAINING STRATEGY
# ==========================================
def combined_dataset_generator(*generators):
    """
    Custom generator that zips multiple Dataset generators.
    Yields balanced batches compiled from all active sub-generators.
    """
    active_gens = [g for g in generators if g is not None]
    if not active_gens:
        return None
        
    while True:
        x_batch, y_batch = [], []
        for gen in active_gens:
            x, y = next(gen)
            x_batch.append(x)
            y_batch.append(y)
        
        # Combine batches from all generators
        x_combined = np.concatenate(x_batch, axis=0)
        y_combined = np.concatenate(y_batch, axis=0)
        
        # Shuffle the newly forged combined batch
        indices = np.arange(x_combined.shape[0])
        np.random.shuffle(indices)
        
        yield x_combined[indices], y_combined[indices]

train_combined_gen = combined_dataset_generator(newhand_gen, handpd_gen, mader_gen)

# Example single-validation generator
val_gen = safe_flow_from_directory(DATA_DIRS['UCI'], val_datagen, batch_size=BATCH_SIZE, subset_name="val", shuffle=False)

# ==========================================
# PHASE 4: MODEL ARCHITECTURE (RGG-NET Base)
# ==========================================
def build_rggnet(input_shape=(224, 224, 3)):
    input_tensor = Input(shape=input_shape)

    # Parallel Data Streams: ResNet50 & InceptionV3
    resnet_base = ResNet50(weights='imagenet', include_top=False, input_tensor=input_tensor)
    googlenet_base = InceptionV3(weights='imagenet', include_top=False, input_tensor=input_tensor)

    # Freeze base models (train only the FC layers)
    for layer in resnet_base.layers:
        layer.trainable = False
    for layer in googlenet_base.layers:
        layer.trainable = False

    # Adaptive Feature Fusion
    resnet_feat = GlobalAveragePooling2D()(resnet_base.output)
    googlenet_feat = GlobalAveragePooling2D()(googlenet_base.output)

    # Concatenate features representing the 'Fusion' aspect of RGG-Net
    fused = Concatenate()([resnet_feat, googlenet_feat])
    
    # Custom Dense Head
    x = Dropout(0.4)(fused)
    x = Dense(256, activation='relu')(x)
    x = Dropout(0.3)(x)
    output = Dense(1, activation='sigmoid')(x) # Binary output (0: Control, 1: PD)

    model = Model(inputs=input_tensor, outputs=output)
    return model

model = build_rggnet()

# Metric tracking including AUC natively
optimizer = tf.keras.optimizers.Adam(learning_rate=0.0001)
model.compile(
    optimizer=optimizer, 
    loss='binary_crossentropy', 
    metrics=['accuracy', tf.keras.metrics.AUC(name='auc')]
)

# ==========================================
# PHASE 5 cont: TRAINING LOGIC
# ==========================================
callbacks_list = [
    EarlyStopping(monitor='val_auc', patience=10, restore_best_weights=True, mode='max'),
    ModelCheckpoint('rggnet_best_model.h5', monitor='val_auc', save_best_only=True, mode='max'),
    ReduceLROnPlateau(monitor='val_auc', factor=0.5, patience=5, min_lr=1e-6, mode='max', verbose=1)
]

def get_steps_per_epoch(*generators):
    total_steps = sum(len(g) for g in generators if g is not None)
    return total_steps if total_steps > 0 else 100

def train_model():
    if train_combined_gen is None:
        print("No training data found. Make sure datasets are placed in the specific directories.")
        return

    steps_per_epoch = get_steps_per_epoch(newhand_gen, handpd_gen, mader_gen)

    print("Starting Training Process...")
    history = model.fit(
        train_combined_gen,
        validation_data=val_gen,
        epochs=50,
        steps_per_epoch=steps_per_epoch,
        callbacks=callbacks_list
    )
    return history


# ==========================================
# PHASE 6: EVALUATION ACROSS ALL DATASETS
# ==========================================
def evaluate_on_dataset(model, dataset_name, datagen):
    print(f"\\n--- Evaluation: {dataset_name} ---")
    if datagen is None:
        print("Datagen is None. Skipped.")
        return

    y_true = datagen.classes
    predictions = model.predict(datagen)
    y_pred_probs = predictions.flatten()
    y_pred_class = (y_pred_probs > 0.5).astype(int)

    acc = accuracy_score(y_true, y_pred_class)
    f1 = f1_score(y_true, y_pred_class)
    auc = roc_auc_score(y_true, y_pred_probs)
    conf_matrix = confusion_matrix(y_true, y_pred_class)

    print(f"Accuracy: {acc*100:.2f}%")
    print(f"F1 Score: {f1:.4f}")
    print(f"AUC     : {auc:.4f}")
    print("Confusion Matrix:")
    print(conf_matrix)

def evaluate_all():
    print("Evaluating models across all training databases and patient data...")
    # NOTE: To evaluate properly, create test generators with shuffle=False
    test_datagen = ImageDataGenerator(rescale=1./255)
    
    # Compare model performance across each individual database and patient data
    for db_name, db_path in DATA_DIRS.items():
        print(f"\\nFetching evaluation data for: {db_name}")
        # Attempt to load the 'test' subset, fallback to 'val' if not present
        gen = safe_flow_from_directory(db_path, test_datagen, BATCH_SIZE, subset_name="test", shuffle=False)
        if gen is None:
            gen = safe_flow_from_directory(db_path, test_datagen, BATCH_SIZE, subset_name="val", shuffle=False)
            
        if gen is not None:
            evaluate_on_dataset(model, f"{db_name} Database", gen)
        else:
            print(f"Could not find 'test' or 'val' directory in {db_path} to evaluate {db_name}.")


# ==========================================
# PHASE 7: EXPLAINABILITY (XAI) - Grad-CAM
# ==========================================
def make_gradcam_heatmap(img_array, model, last_conv_layer_name, pred_index=None):
    # Attempt to locate the exact layer, handling if its nested
    try:
        last_conv_layer = model.get_layer(last_conv_layer_name)
        grad_model = tf.keras.models.Model(
            [model.inputs], [last_conv_layer.output, model.output]
        )
    except ValueError:
        print(f"Layer {last_conv_layer_name} not found directly in model. Searching deeper.")
        return None

    with tf.GradientTape() as tape:
        conv_outputs, predictions = grad_model(img_array)
        if pred_index is None:
            pred_index = tf.argmax(predictions[0])
        class_channel = predictions[:, pred_index]

    grads = tape.gradient(class_channel, conv_outputs)
    pooled_grads = tf.reduce_mean(grads, axis=(0, 1, 2))
    conv_outputs = conv_outputs[0]
    heatmap = conv_outputs @ pooled_grads[..., tf.newaxis]
    heatmap = tf.squeeze(heatmap)
    heatmap = tf.maximum(heatmap, 0) / tf.math.reduce_max(heatmap)
    return heatmap.numpy()

def generate_gradcam(img_path, model, last_conv_layer_name='conv5_block3_out'):
    if not os.path.exists(img_path):
        print(f"Image not found for Grad-CAM: {img_path}")
        return

    img = image.load_img(img_path, target_size=(224, 224))
    img_array = image.img_to_array(img) / 255.0
    img_array = np.expand_dims(img_array, axis=0)

    heatmap = make_gradcam_heatmap(img_array, model, last_conv_layer_name)
    if heatmap is None:
        return

    heatmap = cv2.resize(heatmap, (224, 224))
    heatmap = np.uint8(255 * heatmap)
    heatmap = cv2.applyColorMap(heatmap, cv2.COLORMAP_JET)

    superimposed_img = heatmap * 0.4 + np.array(img)

    plt.figure(figsize=(8, 8))
    plt.imshow(np.uint8(superimposed_img))
    plt.axis('off')
    plt.title("Grad-CAM: Highlighting Tremor Zones")
    plt.show()


# ==========================================
# PHASE 8: EXPORT & DEPLOYMENT 
# ==========================================
def export_ready_models(model, h5_name='rggnet_final_model.h5', tflite_name='rggnet_model.tflite'):
    """
    Exports the complete model as .h5 and .tflite for deployment.
    """
    # 1. H5 format
    model.save(h5_name)
    print(f"✅ Exported to {h5_name}")

    # 2. TFLite format
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    # Enable default optimization to ensure small footprint and rapid inference
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    tflite_model = converter.convert()

    with open(tflite_name, 'wb') as f:
        f.write(tflite_model)
    print(f"✅ Exported to {tflite_name}")

if __name__ == '__main__':
    # Default execution sequence (assuming data is appropriately placed)
    # train_model()
    # evaluate_all()
    # generate_gradcam('sample_test_image.png', model)
    # export_ready_models(model)
    print("Build complete. Script is ready for execution.")
