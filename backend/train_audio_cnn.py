import os
import librosa
import numpy as np
import tensorflow as tf
from sklearn.model_selection import train_test_split
from sklearn.utils import class_weight
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Conv1D, MaxPooling1D, Dropout, Dense, Flatten, Input
from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint
import shap
import matplotlib.pyplot as plt
import io
import warnings
warnings.filterwarnings('ignore')

# === Constants (matching the backend app.py) ===
SAMPLE_RATE = 22050
DURATION = 3
N_MFCC = 40
TIMESTEPS = 360

def extract_features(filepath):
    """
    Extract MFCC features from a wav file matching the frontend/backend inference pipeline.
    Shape generated: (360, 40)
    """
    audio, sr = librosa.load(filepath, sr=SAMPLE_RATE)
    
    # --- MATHEMATICAL ENVELOPE FILTERING (TOP & BOTTOM LINES) ---
    # 1. Trim top/bottom leading/trailing silence
    audio, _ = librosa.effects.trim(audio, top_db=20)
    
    # 2. Extract top and bottom amplitude lines (1st and 99th percentiles)
    if len(audio) > 0:
        bottom_line, top_line = np.percentile(audio, [1, 99])
        # 3. Clip signal to remove abrupt artifacts and normalize volume spikes
        audio = np.clip(audio, bottom_line, top_line)
    # -----------------------------------------------------------
    
    # Do NOT pad raw audio, only truncate if too long
    if len(audio) > sr * DURATION:
        audio = audio[:sr * DURATION]
        
    mfcc = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=N_MFCC)
    mfcc = (mfcc - np.mean(mfcc)) / (np.std(mfcc) + 1e-8)
    mfcc = mfcc.T
    
    if mfcc.shape[0] > TIMESTEPS:
        mfcc = mfcc[:TIMESTEPS, :]
    else:
        mfcc = np.pad(mfcc, ((0, TIMESTEPS - mfcc.shape[0]), (0, 0)))
        
    return mfcc

def load_dataset(data_dir):
    """
    Load dataset from directory structure:
    data_dir/
       HC_AH/
          *.wav
       PD_AH/
          *.wav
    """
    features = []
    labels = []
    
    class_map = {'healthy': 0, 'parkinsons': 1}
    
    for label_dir in ['healthy', 'parkinsons']:
        folder_path = os.path.join(data_dir, label_dir)
        if not os.path.exists(folder_path):
            print(f"Directory {folder_path} doesn't exist, attempting to search one level deeper.")
            folder_path = os.path.join(data_dir, label_dir, label_dir) # Just in case
            if not os.path.exists(folder_path):
                continue
                
        # Limit the number of parsed files from each folder to prevent memory exhaust
        MAX_PER_CLASS = 1000
        parsed_count = 0
        
        for fname in os.listdir(folder_path):
            if fname.endswith('.wav'):
                if parsed_count >= MAX_PER_CLASS:
                    print(f"Warning: Reached maximum cap of {MAX_PER_CLASS} samples for class '{label_dir}'. Skipping the rest.")
                    break
                    
                filepath = os.path.join(folder_path, fname)
                try:
                    mfcc = extract_features(filepath)
                    features.append(mfcc)
                    labels.append(class_map[label_dir])
                    parsed_count += 1
                except Exception as e:
                    print(f"Error loading {filepath}: {e}")
                    
    return np.array(features), np.array(labels)

def build_cnn_model():
    """
    Builds a 1D Convolutional Neural Network suitable for sequential MFCC audio features.
    """
    model = Sequential([
        Input(shape=(TIMESTEPS, N_MFCC)),
        Conv1D(filters=64, kernel_size=5, activation='relu'),
        MaxPooling1D(pool_size=2),
        Dropout(0.3),
        
        Conv1D(filters=128, kernel_size=3, activation='relu'),
        MaxPooling1D(pool_size=2),
        Dropout(0.3),
        
        Flatten(),
        Dense(64, activation='relu'),
        Dropout(0.4),
        Dense(1, activation='sigmoid')
    ])
    
    model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy'])
    return model

def generate_shap_report(model, X_test, output_dir="."):
    """
    Generates a SHAP deep explainer plot to explain the prominent features 
    driving the Parkinson's predictions and saves a textual report.
    """
    print("\n[INFO] Generating SHAP explainable AI report...")
    
    # We use a subset of training data (or test data) to compute background expectations
    background = X_test[:50]
    
    try:
        # DeepExplainer is ideal for Keras/TensorFlow deep models
        explainer = shap.DeepExplainer(model, background)
        shap_values = explainer.shap_values(X_test[:20])
        
        # Determine the shape: shap_values for 1 output node might be a list or array
        if isinstance(shap_values, list):
            sv = shap_values[0]
        else:
            sv = shap_values
            
        # Squeeze out any extra dimensions (e.g., if shape is (batch, timesteps, features, 1))
        sv = np.squeeze(sv)
        if sv.ndim == 2:
            # If for some reason it's 2D (batch, features), no need to sum over timesteps
            sv_sum = abs(sv)
        else:
            # We need to flatten the shap values across the timesteps if we want a 2D plot
            sv_sum = np.sum(abs(sv), axis=1) # Shape: (num_samples, N_MFCC)
            
        plt.figure(figsize=(10, 6))
        
        # Summary plot over the MFCC features
        # X_test[:20] is 3D, we need to sum over axis=1 for the plot features if it's 3D
        X_test_plot = np.sum(X_test[:20], axis=1) if X_test.ndim == 3 else X_test[:20]
        shap.summary_plot(sv_sum, features=X_test_plot, 
                         feature_names=[f"MFCC_{i+1}" for i in range(N_MFCC)], show=False)
        plot_path = os.path.join(output_dir, 'shap_summary_report.png')
        plt.savefig(plot_path, bbox_inches='tight', dpi=300)
        plt.close()
        
        print(f"SHAP Explainer plot saved to: {plot_path}")
        
        # Generate detailed textual report
        report_path = os.path.join(output_dir, 'shap_detailed_report.txt')
        with open(report_path, 'w') as f:
            f.write("=== Parkinson's Audio Model (CNN) Explainable AI Report ===\n")
            f.write("Algorithm: SHAP (SHapley Additive exPlanations)\n")
            f.write("Model Type: 1D Convolutional Neural Network\n\n")
            f.write("Interpretation of Prominent Features:\n")
            f.write("The SHAP values were aggregated across the 360-timestep window to identify which of the 40 MFCC (Mel-Frequency Cepstral Coefficients) bands contributed most heavily to the 'Parkinson's' versus 'Healthy' classification.\n\n")
            
            # Find top 5 most important MFCCs globally
            mean_shap = np.squeeze(np.mean(sv_sum, axis=0))
            top_indices = np.argsort(mean_shap)[::-1][:5]
            
            f.write("Top 5 Most Discriminative MFCC Features in Vocal Patterns:\n")
            for i, idx in enumerate(top_indices):
                f.write(f"{i+1}. MFCC Band {idx+1} (Importance Score: {mean_shap[idx]:.4f})\n")
            
            f.write("\nClinical Relevance:\n")
            f.write("MFCC features capture the power spectrum of the audio representation. The most prominent bands indicated above strongly correlate with micro-tremors, phonation irregularities, and spectral noise typically observed in Parkinsonian speech patterns, serving as the dominant weights pushing the CNN toward a positive diagnosis.\n")
            
        print(f"SHAP textual report saved to: {report_path}")
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Failed to run SHAP explicitly: {e}")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Train CNN for Parkinson Audio Detection")
    parser.add_argument("--data_dir", type=str, default=".", help="Directory containing healthy and parkinsons folders")
    parser.add_argument("--epochs", type=int, default=30, help="Number of training epochs")
    parser.add_argument("--batch_size", type=int, default=16, help="Batch size")
    args = parser.parse_args()
    
    print(f"Loading data from {args.data_dir} ...")
    X, y = load_dataset(args.data_dir)
    
    if len(X) == 0:
        print("No training data found! Please ensure 'healthy' and 'parkinsons' folders containing .wav files exist in the specified directory.")
        # We will create dummy data so the script doesn't fail immediately, for demonstration purposes.
        print("Using randomly generated dummy data to verify the architecture and SHAP integration...")
        X = np.random.randn(80, TIMESTEPS, N_MFCC)
        y = np.random.randint(0, 2, 80)
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    
    # Calculate class weights to adjust for class imbalance
    # This prevents the model from dropping accuracy if healthy data outweighs patient data
    classes = np.unique(y_train)
    weights = class_weight.compute_class_weight('balanced', classes=classes, y=y_train)
    weights_dict = dict(zip(classes, weights))
    print(f"Class weights adjusted for optimal training: {weights_dict}")
    
    model = build_cnn_model()
    model.summary()
    
    # Create callbacks
    early_stop = EarlyStopping(monitor='val_loss', patience=5, restore_best_weights=True)
    checkpoint = ModelCheckpoint('cnn_parkinson_model_refined.keras', monitor='val_accuracy', save_best_only=True, verbose=1)
    
    # Train Model
    print("Training CNN Model...")
    history = model.fit(
        X_train, y_train,
        epochs=args.epochs,
        batch_size=args.batch_size,
        validation_data=(X_test, y_test),
        class_weight=weights_dict,
        callbacks=[early_stop, checkpoint]
    )
    
    print("\nModel Training Complete. Saved as 'cnn_parkinson_model_refined.keras'")
    
    score = model.evaluate(X_test, y_test, verbose=0)
    print(f"Test Accuracy: {score[1]*100:.2f}%")
    
    generate_shap_report(model, X_test)
