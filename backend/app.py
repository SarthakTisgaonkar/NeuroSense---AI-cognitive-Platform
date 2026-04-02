import os
os.environ["NUMBA_NUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
import base64
import json
import cv2
import numpy as np
import io
import traceback

# Import librosa AFTER setting NUMBA_DISABLE_JIT
import librosa
from PIL import Image
from flask import Flask, request, jsonify
from flask_cors import CORS
import tensorflow as tf
from tensorflow.keras.models import Sequential, model_from_json
from tensorflow.keras.layers import Conv1D, MaxPooling1D, Dropout, Dense, Flatten, Input

try:
    import imageio_ffmpeg
    os.environ["PATH"] += os.pathsep + os.path.dirname(imageio_ffmpeg.get_ffmpeg_exe())
except ImportError:
    pass

app = Flask(__name__)
CORS(app)

# Audio constants
SAMPLE_RATE = 22050
DURATION = 3
N_MFCC = 40
TIMESTEPS = 360

# Weight file paths (numpy .npz — fully version-agnostic)
VOICE_WEIGHTS = 'voice_weights.npz'
ORIG_WEIGHTS  = 'orig_weights.npz'
ORIG_CONFIG   = 'orig_config.json'
VGG_WEIGHTS   = 'vgg_weights.npz'
VGG_CONFIG    = 'vgg_config.json'

# Lazy-loaded model cache
_model_voice = None
_model_orig  = None
_model_vgg   = None

def _load_weights_from_npz(model, npz_path):
    """Load weights from a .npz file into a Keras model."""
    data = np.load(npz_path, allow_pickle=False)
    # np.savez stores arrays as arr_0, arr_1, ...
    weights = [data[k] for k in sorted(data.files, key=lambda x: int(x.split('_')[1]))]
    model.set_weights(weights)
    return model

def _build_voice_model():
    """Rebuild the 1D CNN voice model architecture from scratch (from train_audio_cnn.py)."""
    model = Sequential([
        Conv1D(filters=64, kernel_size=5, activation='relu', input_shape=(TIMESTEPS, N_MFCC)),
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

def get_model_voice():
    global _model_voice
    if _model_voice is None:
        print("[Lazy Load] Building VOICE model architecture...")
        model = _build_voice_model()
        print(f"[Lazy Load] Loading VOICE weights from {VOICE_WEIGHTS}...")
        _model_voice = _load_weights_from_npz(model, VOICE_WEIGHTS)
        print("[Lazy Load] Voice model ready.")
    return _model_voice

def _build_orig_model():
    from tensorflow.keras.models import Sequential
    from tensorflow.keras.layers import Input, Conv2D, MaxPooling2D, Flatten, Dense, Dropout
    from tensorflow.keras.regularizers import l2

    model = Sequential([
        Conv2D(128, (5, 5), padding='same', activation='relu', kernel_regularizer=l2(0.001), input_shape=(128, 128, 1)),
        MaxPooling2D(pool_size=(9, 9), strides=(3, 3)),
        
        Conv2D(64, (5, 5), padding='same', activation='relu', kernel_regularizer=l2(0.001)),
        MaxPooling2D(pool_size=(7, 7), strides=(3, 3)),
        
        Conv2D(32, (3, 3), padding='same', activation='relu', kernel_regularizer=l2(0.001)),
        MaxPooling2D(pool_size=(5, 5), strides=(2, 2)),
        
        Conv2D(32, (3, 3), padding='same', activation='relu', kernel_regularizer=l2(0.001)),
        MaxPooling2D(pool_size=(3, 3), strides=(2, 2)),
        
        Flatten(),
        Dropout(0.5),
        Dense(64, activation='relu'),
        Dropout(0.5),
        Dense(2, activation='softmax')
    ])
    return model

def _build_vgg_model():
    from tensorflow.keras.models import Sequential
    from tensorflow.keras.layers import Input, Flatten, Dense, Dropout
    from tensorflow.keras.applications import VGG16

    vgg_base = VGG16(weights=None, include_top=False, input_shape=(224, 224, 3))
    
    model = Sequential([
        vgg_base,
        Flatten(),
        Dense(128, activation='relu'),
        Dropout(0.5),
        Dense(1, activation='sigmoid')
    ])
    return model

def get_model_orig():
    global _model_orig
    if _model_orig is None:
        print("[Lazy Load] Building ORIG model architecture...")
        model = _build_orig_model()
        print(f"[Lazy Load] Loading ORIG weights from {ORIG_WEIGHTS}...")
        _model_orig = _load_weights_from_npz(model, ORIG_WEIGHTS)
        print("[Lazy Load] Orig model ready.")
    return _model_orig

def get_model_vgg():
    global _model_vgg
    if _model_vgg is None:
        print("[Lazy Load] Building VGG model architecture...")
        model = _build_vgg_model()
        print(f"[Lazy Load] Loading VGG weights from {VGG_WEIGHTS}...")
        _model_vgg = _load_weights_from_npz(model, VGG_WEIGHTS)
        print("[Lazy Load] VGG model ready.")
    return _model_vgg

def preprocess_image_orig(image_bytes):
    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None: raise ValueError("Could not decode image.")
    image = cv2.resize(image, (128, 128))
    image = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    image = np.array(image) / 255.0
    image = np.expand_dims(image, axis=0) # Add batch dimension
    image = np.expand_dims(image, axis=-1) # Add channel dimension
    return image

def preprocess_image_vgg(image_bytes):
    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None: raise ValueError("Could not decode image.")
    image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    image = cv2.resize(image, (224, 224))
    image = np.array(image) / 255.0
    image = np.expand_dims(image, axis=0) # Add batch dimension
    return image


def preprocess_audio_for_cnn(audio_bytes, original_filename='audio.wav'):
    import tempfile, os, subprocess
    
    # Determine file extension from the original filename
    _, ext = os.path.splitext(original_filename)
    if not ext:
        ext = '.wav'
    
    # Securely write original uploaded format
    tmp_in = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
    tmp_out = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
    
    try:
        tmp_in.write(audio_bytes)
        tmp_in.close()
        tmp_out.close() # Close so Windows FFMPEG can overwrite it safely
        
        # Use embedded ffmpeg executable explicitly
        import imageio_ffmpeg
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        
        # Convert any format to standardized WAV, limit to 5 seconds to prevent memory overflow
        subprocess.run(
            [ffmpeg_exe, '-y', '-i', tmp_in.name, '-t', '5', '-ar', str(SAMPLE_RATE), '-ac', '1', tmp_out.name],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True
        )
        
        # Librosa load will now use native soundfile strictly parsing .wav
        audio, sr = librosa.load(tmp_out.name, sr=SAMPLE_RATE)
        
        # Debug audio validation
        print(f"DEBUG Audio | Shape: {audio.shape}")
        if len(audio) > 0:
            print(f"DEBUG Audio | Max: {np.max(audio)}")
            print(f"DEBUG Audio | Min: {np.min(audio)}")
            print(f"DEBUG Audio | Mean: {np.mean(audio)}")
            print(f"DEBUG Audio | Duration: {len(audio)/sr:.2f}s")
        else:
            print("DEBUG Audio | Status: waveform is empty after load")
            
        # Read the wav bytes here before the finally block unlinks the file!
        with open(tmp_out.name, 'rb') as f:
            wav_bytes = f.read()
            
    finally:
        if os.path.exists(tmp_in.name):
            try: os.unlink(tmp_in.name)
            except: pass
        if os.path.exists(tmp_out.name):
            try: os.unlink(tmp_out.name)
            except: pass
            
    # Wait to catch extreme short audio immediately
    if len(audio) == 0:
        raise ValueError("Audio waveform is entirely empty after decoding.")
        
    # Relaxed silence detection (safe threshold instead of exact 0)
    max_amp = np.max(np.abs(audio))
    if max_amp < 1e-4:
        raise ValueError("Audio is effectively empty or totally silent. Make sure your microphone is picking up sound.")

    # 0. NORMALIZE AMPLITUDE AND REMOVE AMBIENT HUM
    # Median filter to drop static hum from cheaper mobile mics common in non-lab settings
    import scipy.signal
    audio = scipy.signal.medfilt(audio, kernel_size=3)
    audio = audio / np.max(np.abs(audio))
            
    # --- MATHEMATICAL ENVELOPE FILTERING (TOP & BOTTOM LINES) ---
    # 1. Trim top/bottom leading/trailing silence (top_db=25 leaves more natural speech decay)
    audio_trimmed, _ = librosa.effects.trim(audio, top_db=25)
    
    # Only keep the trimmed version if it didn't obliterate the audio (> 0.5s left)
    if len(audio_trimmed) > sr * 0.5:
        audio = audio_trimmed
        
    # 2. Extract top and bottom amplitude lines (1st and 99th percentiles)
    if len(audio) > 0:
        bottom_line, top_line = np.percentile(audio, [1, 99])
        # 3. Clip signal to remove abrupt artifacts and normalize volume spikes
        if top_line > bottom_line:  # Prevent clipping to a flat constant
            audio = np.clip(audio, bottom_line, top_line)
    # -----------------------------------------------------------
    
    # Validation check after filtering
    if len(audio) < sr * 0.5:  # Less than 0.5 seconds of valid data is useless
        raise ValueError("Audio does not contain enough valid speech data after trimming.")
    
    # Truncate if longer, but do NOT pad raw audio with zeros here to preserve MFCC variance
    if len(audio) > sr * DURATION:
        audio = audio[:sr * DURATION]
        
    mfcc = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=N_MFCC)
    mfcc = (mfcc - np.mean(mfcc)) / (np.std(mfcc) + 1e-8)
    mfcc = mfcc.T
    
    # Pad the MFCC explicitly instead of raw audio
    if mfcc.shape[0] > TIMESTEPS:
        mfcc = mfcc[:TIMESTEPS, :]
    else:
        mfcc = np.pad(mfcc, ((0, TIMESTEPS - mfcc.shape[0]), (0, 0)))
        
    import base64
    wav_b64 = base64.b64encode(wav_bytes).decode('utf-8')
        
    # Shape should be (1, TIMESTEPS, N_MFCC)
    return mfcc.reshape(1, TIMESTEPS, N_MFCC), wav_b64

@app.route('/predict/voice', methods=['POST'])
def predict_voice():
    try:
        model_voice = get_model_voice()
    except Exception as e:
        return jsonify({"error": f"Voice model failed to load: {e}"}), 500

    try:
        # Check if file part exists in request
        if 'audio' not in request.files:
            return jsonify({"error": "No audio file provided."}), 400

        audio_file = request.files['audio']
        if audio_file.filename == '':
            return jsonify({"error": "No selected audio file."}), 400
            
        audio_bytes = audio_file.read()

        # Preprocess
        features, wav_b64 = preprocess_audio_for_cnn(audio_bytes, original_filename=audio_file.filename)
        
        # Predict Model (CNN)
        preds = model_voice.predict(features)
        
        raw_parkinson_prob = float(preds[0][0]) if preds.shape[1] == 1 else float(preds[0][1])
        
        # --- DOMAIN SHIFT CALIBRATION (Non-Indian Training -> Indian Clinical Inference) ---
        # Logistic Temperature Scaling to penalize cross-domain false positives
        # Reduces extreme 99% logic to robust 70-80% realism and requires more acoustic evidence
        logit = np.log((raw_parkinson_prob + 1e-7) / (1 - raw_parkinson_prob + 1e-7))
        temperature = 0.65 # Squeeze extrema towards center
        bias = -0.4 # Shift boundary rightwards (fewer false positives)
        
        calibrated_logit = (logit * temperature) + bias
        calibrated_parkinson_prob = 1.0 / (1.0 + np.exp(-calibrated_logit))
        
        parkinson_prob = float(calibrated_parkinson_prob)
        healthy_prob = 1.0 - parkinson_prob
            
        if parkinson_prob > 0.5:
            predicted_label = "Parkinson"
            confidence_percent = parkinson_prob * 100.0
        else:
            predicted_label = "Healthy"
            confidence_percent = healthy_prob * 100.0

        return jsonify({
            "status": "success",
            "prediction": predicted_label,
            "probabilities": {
                "Healthy": healthy_prob,
                "Parkinson": parkinson_prob
            },
            "parkinson_risk_score": parkinson_prob * 100.0,
            "confidence_percent": confidence_percent,
            "processed_audio_b64": wav_b64
        })
    except Exception as e:
        print(f"Error during voice prediction: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/predict/spiral', methods=['POST'])
def predict_spiral():
    try:
        model_orig = get_model_orig()
        model_vgg = get_model_vgg()
    except Exception as e:
        return jsonify({"error": f"Spiral model(s) failed to load: {e}"}), 500

    try:
        data = request.json
        if not data or 'image' not in data:
            return jsonify({"error": "No image data provided. Please provide a base64 encoded 'image' string."}), 400

        base64_str = data['image']
        if ',' in base64_str:
            base64_str = base64_str.split(',')[1]

        image_bytes = base64.b64decode(base64_str)
        
        # Preprocess for both models
        processed_img_orig = preprocess_image_orig(image_bytes)
        processed_img_vgg = preprocess_image_vgg(image_bytes)
        
        # Predict Model 1 (Original)
        # Returns [[prob_healthy, prob_parkinson]]
        pred_orig = model_orig.predict(processed_img_orig)[0]
        prob_parkinson_orig = float(pred_orig[1])
        
        # Predict Model 2 (VGG)
        # Returns [[prob_parkinson]]
        pred_vgg = model_vgg.predict(processed_img_vgg)[0]
        prob_parkinson_vgg = float(pred_vgg[0])
        
        # Ensemble Average
        final_parkinson_prob = (prob_parkinson_orig + prob_parkinson_vgg) / 2.0
        final_healthy_prob = 1.0 - final_parkinson_prob
        
        if final_parkinson_prob > 0.5:
            predicted_label = "Parkinson"
            confidence_percent = final_parkinson_prob * 100.0
        else:
            predicted_label = "Healthy"
            confidence_percent = final_healthy_prob * 100.0

        return jsonify({
            "status": "success",
            "prediction": predicted_label,
            "probabilities": {
                "Healthy": final_healthy_prob,
                "Parkinson": final_parkinson_prob,
                "Model1_Orig_Prob": prob_parkinson_orig,
                "Model2_VGG_Prob": prob_parkinson_vgg
            },
            "parkinson_risk_score": final_parkinson_prob * 100.0,
            "confidence_percent": confidence_percent
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    models_loaded = (_model_orig is not None) and (_model_vgg is not None) and (_model_voice is not None)
    return jsonify({"status": "running", "models_loaded": models_loaded, "note": "models load on first prediction request"})

if __name__ == '__main__':
    print("Starting Flask API Server on port 5000...")
    # use_reloader=False is critical - the reloader forks a child process and the
    # Keras models are only loaded in the parent, causing the child to have model=None.
    app.run(host='0.0.0.0', port=5000, debug=True, use_reloader=False)
