import os
import cv2
import math
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers, models
from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint
from sklearn.model_selection import train_test_split
import kagglehub

# ==========================================
# 0. DUMMY DATA GENERATOR (For instant testing)
# ==========================================
def generate_synthetic_datasets():
    """Generates synthetic spirals if real datasets aren't found so the script is instantly runnable."""
    datasets = ["./datasets/mader_original", "./datasets/hand_pd", "./datasets/augmented_spirals"]
    
    for base_path in datasets:
        if os.path.exists(base_path): 
            continue # Skip if real data exists
            
        print(f"Generating synthetic data for {base_path}...")
        for category in ['healthy', 'parkinson']:
            path = os.path.join(base_path, category)
            os.makedirs(path, exist_ok=True)
            
            # Generate 50 images per category per dataset
            for i in range(50):
                img = np.ones((256, 256, 3), dtype=np.uint8) * 255 # White background
                
                # Randomize ink and background slightly to test preprocessing
                bg_color = np.random.randint(200, 256)
                img[:] = bg_color
                ink_color = (np.random.randint(0, 50), np.random.randint(0, 50), np.random.randint(0, 150))
                
                center = (128, 128)
                max_radius = 100
                turns = 4
                
                points = []
                for theta in np.linspace(0, turns * 2 * math.pi, 200):
                    r = (theta / (turns * 2 * math.pi)) * max_radius
                    x = int(center[0] + r * math.cos(theta))
                    y = int(center[1] + r * math.sin(theta))
                    
                    # Add tremor/noise for Parkinson's class
                    if category == 'parkinson':
                        x += np.random.randint(-3, 4)
                        y += np.random.randint(-3, 4)
                        
                    points.append((x, y))
                
                for j in range(len(points) - 1):
                    cv2.line(img, points[j], points[j+1], ink_color, 2)
                    
                cv2.imwrite(os.path.join(path, f"synthetic_{i}.png"), img)

# ==========================================
# 1. ROBUST IMAGE PREPROCESSING
# ==========================================
def preprocess_spiral(image_path, img_size=(224, 224)):
    """
    Removes background/page color and extracts only the ink using CLAHE & Auto-Crop.
    """
    # Read image
    img = cv2.imread(image_path)
    if img is None: return None
    
    # 1. Convert to Grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # 2. CLAHE (Contrast Limited Adaptive Histogram Equalization)
    # Equalizes lighting and eliminates yellow paper/shadows
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
    enhanced = clahe.apply(gray)
    
    # 3. Gaussian Blur to smooth out paper texture
    blurred = cv2.GaussianBlur(enhanced, (5, 5), 0)
    
    # 4. Otsu's Thresholding: Automatically finds the perfect threshold to extract ink
    # Inverts it so Background = Black (0), Ink = White (255)
    _, binary_ink = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    
    # 5. Morphological Closing: Connects broken pen strokes explicitly
    kernel = np.ones((3, 3), np.uint8)
    binary_ink = cv2.morphologyEx(binary_ink, cv2.MORPH_CLOSE, kernel)
    
    # 6. SYNTHETIC CONTOUR RECONSTRUCTION
    # Finds the absolute mathematical path of the ink
    contours, _ = cv2.findContours(binary_ink, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    # Create empty black canvas (Background = Black (0), Ink will be White (255))
    canvas = np.zeros((img_size[1], img_size[0]), dtype=np.uint8)
    
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
            
        # Draw perfectly smooth, anti-aliased lines of fixed thickness, deleting all aliasing jaggies
        cv2.drawContours(canvas, scaled_contours, -1, 255, thickness=2, lineType=cv2.LINE_AA)
    
    # 8. Normalize pixel values to [0, 1]
    normalized = canvas.astype('float32') / 255.0
    
    # Add channel dimension (224, 224, 1) for CNN
    return np.expand_dims(normalized, axis=-1)


# ==========================================
# 3. AI MODEL ARCHITECTURE
# ==========================================
def build_model(input_shape=(224, 224, 1)):
    """Builds a CNN with Dual Pooling for spiral classification."""
    from tensorflow.keras.layers import Input, Conv2D, MaxPooling2D, GlobalAveragePooling2D, GlobalMaxPooling2D, Concatenate, Dense, Dropout, BatchNormalization
    from tensorflow.keras.models import Model
    
    inputs = Input(shape=input_shape)
    
    # Feature Extraction Layers
    x = Conv2D(32, (3, 3), activation='relu')(inputs)
    x = MaxPooling2D((2, 2))(x)
    
    x = Conv2D(64, (3, 3), activation='relu')(x)
    x = MaxPooling2D((2, 2))(x)
    
    x = Conv2D(128, (3, 3), activation='relu')(x)
    x = MaxPooling2D((2, 2))(x)
    
    # Dual Pooling: Captures overall shape (Average) and sharp tremors (Max)
    avg_pool = GlobalAveragePooling2D()(x)
    max_pool = GlobalMaxPooling2D()(x)
    merged = Concatenate()([avg_pool, max_pool])
    
    # Classification Layers
    x = BatchNormalization()(merged)
    x = Dense(256, activation='relu')(x)
    x = Dropout(0.5)(x) # Dropout prevents overfitting
    outputs = Dense(1, activation='sigmoid')(x) # Binary output: 0 (Healthy) or 1 (PD)
    
    model = Model(inputs=inputs, outputs=outputs)
    
    model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=0.0005), 
                  loss='binary_crossentropy', 
                  metrics=['accuracy', tf.keras.metrics.AUC(name='auc')])
    return model

# ==========================================
# 4. TRAINING & EVALUATING MULTIPLE DATASETS
# ==========================================
def find_best_dataset():
    # Setup test environment
    generate_synthetic_datasets()
    
    # Download Kaggle dataset dynamically
    print("\n[INFO] Downloading kmader/parkinsons-drawings from Kaggle...")
    kaggle_path = kagglehub.dataset_download("kmader/parkinsons-drawings")
    print(f"[INFO] Kaggle Dataset Path: {kaggle_path}")
    
    # Define datasets to test against
    datasets = {
        "Base_Kaggle_Local": "./datasets/mader_original",
        "HandPD": "./datasets/hand_pd",
        "Augmented_Set": "./datasets/augmented_spirals",
        "Kaggle_Hub_Download": kaggle_path
    }
    
    best_dataset = None
    best_accuracy = 0.0
    EPOCHS = 60 # Increased epochs for better accuracy convergence
    
    print("\nStarting Automated Spiral Dataset Evaluation...")

    for name, path in datasets.items():
        print(f"\n" + "="*40)
        print(f"🧪 Testing Dataset: {name}")
        print("="*40)
        
        # Datasets use varying label folder names, try to auto-detect mappings
        X, y = [], []
        
        # Valid label strings indicating Healthy (0) vs PD (1)
        healthy_synonyms = ['healthy', 'control', '0']
        pd_synonyms = ['parkinson', 'parkinsons', 'pd', '1']
        
        if os.path.exists(path):
            for root, _, files in os.walk(path):
                # We only want spiral images, not wave. So skip wave.
                if 'wave' in root.lower(): continue
                
                category_lower = os.path.basename(root).lower()
                
                # Determine label mapping protecting against inverse assigning
                if any(syn in category_lower for syn in healthy_synonyms):
                    label = 0
                elif any(syn in category_lower for syn in pd_synonyms):
                    label = 1
                else:
                    continue # Skip unknown folders
                    
                print(f"Loading files from {root} as Class {label}...")
                
                for file in files:
                    if not file.lower().endswith(('.png', '.jpg', '.jpeg')): continue
                    img_path = os.path.join(root, file)
                    processed_img = preprocess_spiral(img_path)
                    
                    if processed_img is not None:
                        X.append(processed_img)
                        y.append(label)
                        
        X = np.array(X)
        y = np.array(y)
        
        if len(X) < 10:
            print(f"Skipping {name} - Not enough data found.")
            continue
            
        print(f"Successfully loaded {len(X)} processed images.")
            
        # Split into training and validation sets
        X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42)
        
        model = build_model()
        
        # Callbacks to stop early if the model isn't learning to prevent time waste
        callbacks = [
            EarlyStopping(monitor='val_accuracy', patience=5, restore_best_weights=True),
            ModelCheckpoint(f'model_{name}.keras', save_best_only=True, monitor='val_accuracy', verbose=0)
        ]
        
        # Train the model
        history = model.fit(
            X_train, y_train,
            epochs=EPOCHS,
            validation_data=(X_val, y_val),
            callbacks=callbacks,
            batch_size=16,
            verbose=1
        )
        
        # Record max accuracy
        max_val_acc = max(history.history['val_accuracy'])
        print(f"\n=> Dataset {name} peaked at {max_val_acc*100:.2f}% validation accuracy.\n")
        
        if max_val_acc > best_accuracy:
            best_accuracy = max_val_acc
            best_dataset = name
            
        # Per user instruction, save kaggle explicitly as model_Base_Kaggle.keras
        if name == "Kaggle_Hub_Download":
            # Save the Kaggle set explicitly using model_Base_Kaggle.keras naming for standardization
            model.save("model_Base_Kaggle.keras")
            print("[INFO] Saved Kaggle weights as model_Base_Kaggle.keras")

    print("\n" + "🌟"*20)
    print(f"🏆 BEST DATASET FOUND: {best_dataset}")
    print(f"📈 PEAK ACCURACY: {best_accuracy*100:.2f}%")
    print(f"💾 Best weights saved as: model_{best_dataset}.keras")
    print("🌟"*20)
    
if __name__ == "__main__":
    find_best_dataset()
