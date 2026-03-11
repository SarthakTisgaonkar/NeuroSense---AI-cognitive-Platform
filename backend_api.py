import os
import base64
import cv2
import numpy as np
import io
from PIL import Image
from flask import Flask, request, jsonify
from flask_cors import CORS
import tensorflow as tf
from tensorflow.keras.models import load_model

app = Flask(__name__)
# Restrict max request size to 16MB to prevent DOS attacks
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

# Enable CORS for the React frontend (running on Vite's default ports like 5173)
CORS(app)

@app.after_request
def add_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response

# Load the trained CNN model
MODEL_PATH = 'parkinson_disease_detection.h5'
try:
    print(f"Loading custom CNN model from {MODEL_PATH}...")
    model = load_model(MODEL_PATH)
    print("Model loaded successfully.")
    # Extract model info if needed, or assume fixed shape
    # Based on original script: input_shape=(128, 128, 1)
except Exception as e:
    print(f"Error loading model: {e}")
    model = None

# Labels as defined in original script
labels = ['Healthy', 'Parkinson']

def preprocess_image(image_bytes):
    """
    Decodes the base64 image bytes, resizes, converts to grayscale, and normalizes.
    Matches the preprocessing in parkinson's_disease_detection.py
    """
    # Convert bytes to numpy array
    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if image is None:
        raise ValueError("Could not decode image.")

    # Apply the preprocessing steps defined in the original training script
    image = cv2.resize(image, (128, 128))
    image = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    image = np.array(image)
    
    # Normalize to 0-1 range
    image = image / 255.0
    
    # Expand dimensions to match model expected input: (batch_size, height, width, channels)
    image = np.expand_dims(image, axis=0) # Add batch dimension
    image = np.expand_dims(image, axis=-1) # Add channel dimension
    
    return image

@app.route('/predict/spiral', methods=['POST'])
def predict_spiral():
    if model is None:
        return jsonify({"error": "Model not loaded on server."}), 500

    try:
        data = request.json
        if not data or 'image' not in data:
            return jsonify({"error": "No image data provided. Please provide a base64 encoded 'image' string."}), 400

        # The frontend sends a base64 data URL (e.g., 'data:image/jpeg;base64,...')
        base64_str = data['image']
        if ',' in base64_str:
            base64_str = base64_str.split(',')[1]

        # Validate and Decode base64
        try:
            image_bytes = base64.b64decode(base64_str, validate=True)
        except Exception:
            return jsonify({"error": "Invalid base64 encoding provided."}), 400
            
        # Preprocess
        try:
            processed_img = preprocess_image(image_bytes)
        except ValueError as ve:
            return jsonify({"error": str(ve)}), 400
        
        # Predict
        prediction = model.predict(processed_img)
        
        # prediction is a 2D array: [[prob_healthy, prob_parkinson]]
        probs = prediction[0]
        predicted_class_idx = np.argmax(probs)
        predicted_label = labels[predicted_class_idx]
        
        healthy_prob = float(probs[0])
        parkinson_prob = float(probs[1])
        
        # We calculate uncertainty/entropy to match the frontend's confidence logic, or just return basic confidence
        confidence_percent = float(probs[predicted_class_idx]) * 100.0

        return jsonify({
            "status": "success",
            "prediction": predicted_label,
            "probabilities": {
                "Healthy": healthy_prob,
                "Parkinson": parkinson_prob
            },
            "parkinson_risk_score": parkinson_prob * 100.0,
            "confidence_percent": confidence_percent
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "running", "model_loaded": model is not None})

if __name__ == '__main__':
    print("Starting Flask API Server on port 5000...")
    app.run(host='0.0.0.0', port=5000, debug=True)
