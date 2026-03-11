import streamlit as st
import numpy as np
import cv2
from tensorflow.keras.models import load_model

# Load the trained model
@st.cache_resource
def load_parkinson_model():
    return load_model('parkinson_disease_detection.h5')

model = load_parkinson_model()

# Labels
labels = ['Healthy', 'Parkinson']

st.title("Parkinson's Disease Detection from Spiral Drawings")

st.write("Upload a spiral drawing image to detect if it's from a healthy person or a Parkinson patient.")

uploaded_file = st.file_uploader("Choose an image...", type=["png", "jpg", "jpeg"])

if uploaded_file is not None:
    # Read the image
    file_bytes = np.asarray(bytearray(uploaded_file.read()), dtype=np.uint8)
    image = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

    # Display the uploaded image
    st.image(image, caption='Uploaded Image', use_column_width=True)

    # Preprocess the image
    image_resized = cv2.resize(image, (128, 128))
    image_gray = cv2.cvtColor(image_resized, cv2.COLOR_BGR2GRAY)
    image_expanded = np.expand_dims(image_gray, axis=[0, -1])

    # Make prediction
    prediction = model.predict(image_expanded)
    predicted_class = np.argmax(prediction, axis=1)[0]
    predicted_label = labels[predicted_class]

    # Display the result
    st.write(f"**Prediction:** {predicted_label}")

    # Show confidence
    confidence = prediction[0][predicted_class] * 100
    st.write(f"**Confidence:** {confidence:.2f}%")

    if predicted_label == 'Parkinson':
        st.error("The spiral drawing indicates signs of Parkinson's disease.")
    else:
        st.success("The spiral drawing appears healthy.")