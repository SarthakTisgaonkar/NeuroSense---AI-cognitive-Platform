import numpy as np
import os
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing import image

# Load the trained model once when the module is imported
model_path = os.path.join(os.path.dirname(__file__), 'spiral_model.h5')
model = load_model(model_path)

def predict_spiral(img_path):
    """
    Predicts whether the given spiral drawing indicates Parkinson's Disease or not.

    Args:
        img_path (str): Path to the image to predict.

    Returns:
        str: Prediction result – "Parkinson Detected" or "Healthy Drawing"
    """
    try:
        # Load and preprocess the image
        img = image.load_img(img_path, target_size=(224, 224))
        img_array = image.img_to_array(img) / 255.0
        img_array = np.expand_dims(img_array, axis=0)

        # Make prediction
        prediction = model.predict(img_array)

        # Interpret result
        if prediction[0][0] > 0.5:
            return "Parkinson Detected"
        else:
            return "Healthy Drawing"

    except Exception as e:
        return f"Error: {str(e)}"
