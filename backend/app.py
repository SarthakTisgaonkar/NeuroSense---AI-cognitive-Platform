import os
import base64
import cv2
import numpy as np
import io
import traceback
import librosa
from PIL import Image
from flask import Flask, request, jsonify
from flask_cors import CORS
import tensorflow as tf
from tensorflow.keras.models import load_model

try:
    import imageio_ffmpeg
    os.environ["PATH"] += os.pathsep + os.path.dirname(imageio_ffmpeg.get_ffmpeg_exe())
except ImportError:
    pass

app = Flask(__name__)
# Enable CORS for the React frontend (running on Vite's default ports like 5173)
CORS(app)

# Audio constants - must be defined before model loading for the warm-up call
SAMPLE_RATE = 22050
DURATION = 3
N_MFCC = 40
TIMESTEPS = 360

# Load the trained CNN models
MODEL_PATH_ORIG = 'parkinson_disease_detection.h5'
MODEL_PATH_VGG = 'spiral_model_fixed.keras'
MODEL_PATH_VOICE = 'cnn_parkinson_model_refined.keras'

try:
    print(f"Loading VOICE model from {MODEL_PATH_VOICE}...")
    model_voice = load_model(MODEL_PATH_VOICE)
    # Warm-up: run a dummy prediction to initialize the TF graph in this thread
    _dummy_audio = np.zeros((1, TIMESTEPS, N_MFCC), dtype=np.float32)
    model_voice.predict(_dummy_audio, verbose=0)
    print("Voice model loaded and warmed up successfully.")
except Exception as e:
    print(f"Error loading voice model: {e}")
    model_voice = None

try:
    print(f"Loading ORIGINAL model from {MODEL_PATH_ORIG}...")
    model_orig = load_model(MODEL_PATH_ORIG)
    _dummy_img_orig = np.zeros((1, 128, 128, 1), dtype=np.float32)
    model_orig.predict(_dummy_img_orig, verbose=0)
    print("Original model loaded and warmed up.")
except Exception as e:
    print(f"Error loading original model: {e}")
    model_orig = None

try:
    print(f"Loading NEW VGG model from {MODEL_PATH_VGG}...")
    model_vgg = load_model(MODEL_PATH_VGG)
    _dummy_img_vgg = np.zeros((1, 224, 224, 3), dtype=np.float32)
    model_vgg.predict(_dummy_img_vgg, verbose=0)
    print("New VGG model loaded and warmed up.")
except Exception as e:
    print(f"Error loading new VGG model: {e}")
    model_vgg = None

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
        
        # Convert any format to standardized WAV, ignoring console spam
        subprocess.run(
            [ffmpeg_exe, '-y', '-i', tmp_in.name, '-ar', str(SAMPLE_RATE), '-ac', '1', tmp_out.name],
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
    if model_voice is None:
        return jsonify({"error": "Voice model failed to load on server."}), 500

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
    if model_orig is None or model_vgg is None:
        return jsonify({"error": "One or both models failed to load on server."}), 500

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
    models_loaded = (model_orig is not None) and (model_vgg is not None) and (model_voice is not None)
    return jsonify({"status": "running", "models_loaded": models_loaded})

if __name__ == '__main__':
    print("Starting Flask API Server on port 5000...")
    # use_reloader=False is critical - the reloader forks a child process and the
    # Keras models are only loaded in the parent, causing the child to have model=None.
    app.run(host='0.0.0.0', port=5000, debug=True, use_reloader=False)
