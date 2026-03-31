# detection_app/views.py

from operator import attrgetter
from django.shortcuts import render, redirect
from django.contrib.auth import login, logout, authenticate
from django.contrib.auth.forms import AuthenticationForm, UserCreationForm
from django import forms
from django.contrib import messages
from .quiz_data import questions, option_choices # Import option_choices now
from .models import AssessmentResult
from django.contrib.auth.decorators import login_required
import joblib
import numpy as np
import os
from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from .models import PatientProfile, AssessmentHistory 
from .spiral_predict import predict_spiral
from django.core.files.storage import default_storage
from django.urls import reverse
from django.core.files.storage import FileSystemStorage
from .models import SpiralAssessmentResult  # ✅ Add this import
from .models import AssessmentResult, SpiralAssessmentResult
from itertools import chain


def voice_detection_view(request):
    return render(request, 'detection_app/voice_upload.html')

def brain_detection_view(request):
    return render(request, 'detection_app/posture_video_upload.html')



# Define paths for model and encoder
MODEL_PATH = os.path.join(os.path.dirname(__file__), "parkinsons_stage_model.joblib")
ENCODER_PATH = os.path.join(os.path.dirname(__file__), "label_encoder.joblib")

stage_model = None
label_encoder = None

try:
    stage_model = joblib.load(MODEL_PATH)
    label_encoder = joblib.load(ENCODER_PATH)
    print("✅ Models loaded successfully!")
    print(f"Label Encoder Classes: {label_encoder.classes_}")
    print(f"Model expected features (n_features_in_): {stage_model.n_features_in_}")

except Exception as e:
    stage_model = None
    label_encoder = None
    print(f"⚠️ Model or Encoder loading failed: {e}")

# ---------------------------- Forms ----------------------------------

class CustomAuthenticationForm(AuthenticationForm):
    username = forms.CharField(widget=forms.TextInput(attrs={
        'placeholder': 'Enter your username or email',
        'class': 'input-field'
    }))
    password = forms.CharField(widget=forms.PasswordInput(attrs={
        'placeholder': 'Enter your password',
        'class': 'input-field'
    }))

class CustomUserCreationForm(UserCreationForm):
    class Meta(UserCreationForm.Meta):
        model = UserCreationForm.Meta.model
        fields = ('username',) + UserCreationForm.Meta.fields[1:]
        widgets = {
            'username': forms.TextInput(attrs={
                'placeholder': 'Enter your username',
                'class': 'input-field'
            }),
            'password1': forms.PasswordInput(attrs={
                'placeholder': 'Enter your password',
                'class': 'input-field'
            }),
            'password2': forms.PasswordInput(attrs={
                'placeholder': 'Confirm your password',
                'class': 'input-field'
            }),
        }

# ---------------------------- Views ----------------------------------

def home(request):
    return render(request, 'detection_app/index.html')
@login_required
def quiz(request):
    """
    Renders the quiz with questions grouped into 5 sections (4 questions each)
    """
    grouped_questions = [questions[i:i + 4] for i in range(0, len(questions), 4)]
    context = {
        'question_pages': grouped_questions,
        'option_choices': option_choices, # Use the imported option_choices
    }
    return render(request, 'detection_app/quiz.html', context)

def upload_assessment(request):
    """
    Handles quiz submission, processes the POST request, performs prediction,
    and renders the result page with only the predicted stage and consultation advice.
    """
    if request.method == "POST":
        user_inputs = []

        # Define the ordinal mapping as used in your Colab notebook for consistency
        # {"Never": 0, "Rarely": 1, "Sometimes": 2, "Often": 3, "Always": 4}
        ordinal_map_django = {
            "never": 0,
            "rarely": 1,
            "sometimes": 2,
            "often": 3,
            "always": 4
        }

        # These keys now match the 'name' attributes from quiz_data.py
        question_keys = [f"q{i}" for i in range(1, 21)] # Generates "q1", "q2", ..., "q20"

        # Process quiz answers
        for key in question_keys:
            value = request.POST.get(key, '').lower()
            # Use .get() with a default value to handle missing keys gracefully (e.g., if a question was skipped)
            # If a value is not in ordinal_map_django, default to 0 (Never) or handle as an error
            user_inputs.append(ordinal_map_django.get(value, 0)) # Default to 0 if not found

        # Initialize core context variables with default values
        predicted_stage_text = "Not Assessed"
        main_result_message = "Assessment Incomplete" # New variable for main message
        stage_description = "Please complete the assessment quiz for a preliminary indication."
        doctor_type = "Neurologist"
        next_steps_advice = [
            "Schedule an appointment with a neurologist for a professional evaluation.",
            "Prepare a detailed list of your symptoms and their onset for your doctor.",
            "Discuss any family history of neurological conditions.",
            "Do not self-diagnose or alter any medication based on this assessment."
        ]
        consolation_message = "Thank you for completing the assessment. Remember, early information is a step towards better health." # Default consolation

        # Attempt to make a prediction if model is available and inputs are correct
        if stage_model and label_encoder:
            try:
                # Reshape for single prediction
                prediction_array = np.array(user_inputs).reshape(1, -1)

                # --- START DEBUGGING PRINTS ---
                print(f"\n--- Prediction Debugging ---")
                print(f"Raw user_inputs (length {len(user_inputs)}): {user_inputs}")
                print(f"Numpy array for prediction (shape {prediction_array.shape}):\n{prediction_array}")
                print(f"Model expected features (n_features_in_): {stage_model.n_features_in_}")
                # --- END DEBUGGING PRINTS ---

                if len(user_inputs) == stage_model.n_features_in_:
                    # No scaler application, as per your Colab notebook
                    prediction = stage_model.predict(prediction_array)[0]
                    predicted_stage_text = label_encoder.inverse_transform([prediction])[0]

                    # --- START DEBUGGING PRINTS ---
                    print(f"Raw numerical prediction (index): {prediction}")
                    print(f"Inverse transformed prediction text: {predicted_stage_text}")
                    print(f"--- End Prediction Debugging ---\n")
                    # --- END DEBUGGING PRINTS ---
                    
                    # Refine messages based on the predicted_stage_text for all 6 stages
                    if "No Parkinson" in predicted_stage_text or "No PD" in predicted_stage_text or "Healthy" in predicted_stage_text:
                        main_result_message = "Fantastic News! Your assessment indicates a low likelihood of Parkinson's symptoms."
                        stage_description = "This is a great sign! Continue to prioritize your health and well-being. Remember, this assessment is preliminary; consult a doctor if any concerns arise."
                        doctor_type = "General Practitioner (for routine check-ups)"
                        next_steps_advice = [
                            "Maintain a healthy and active lifestyle with regular exercise and a balanced diet.",
                            "Stay vigilant for any new or unusual health changes and consult your doctor if they occur.",
                            "Consider regular wellness check-ups with your general practitioner for overall health maintenance."
                        ]
                        consolation_message = "Wonderful news! Your commitment to health is admirable. Keep shining brightly! Remember to enjoy life's simple pleasures and stay positive."
                    elif "Stage 1" in predicted_stage_text:
                        main_result_message = "Preliminary Indication: Early Stage Symptoms for Parkinson's Detected."
                        stage_description = "Early detection is crucial. Consulting a neurologist promptly can help in confirming diagnosis and discussing early management strategies to maintain quality of life."
                        doctor_type = "Neurologist (Specialist)"
                        next_steps_advice = [
                            "Schedule an appointment with a neurologist as soon as possible for a definitive diagnosis.",
                            "Prepare a detailed list of your symptoms, their onset, and any family history for your doctor.",
                            "Discuss potential early interventions, lifestyle adjustments, and therapeutic options.",
                            "Do not self-diagnose or alter any medication based on this assessment."
                        ]
                        consolation_message = "Remember, you're not alone on this journey. Every step forward, no matter how small, is progress. Focus on self-care and lean on your support system. We're here to support you."
                    elif "Stage 2" in predicted_stage_text:
                        main_result_message = "Preliminary Indication: Moderate Stage Symptoms for Parkinson's Detected."
                        stage_description = "It's important to consult a neurologist for a comprehensive evaluation. Effective treatments are available to manage symptoms and improve daily living."
                        doctor_type = "Neurologist (Specialist)"
                        next_steps_advice = [
                            "Seek consultation with a neurologist for a thorough diagnosis and treatment plan.",
                            "Discuss medication options and non-pharmacological therapies (e.g., physical therapy, occupational therapy).",
                            "Explore local support groups and educational resources for Parkinson's patients and caregivers.",
                            "Ensure regular follow-up appointments with your medical team to adjust treatment as needed."
                        ]
                        consolation_message = "Your strength is inspiring. Focus on self-care and lean on your support system. Brighter days are ahead, and every effort counts. Keep your spirits high!"
                    elif "Stage 3" in predicted_stage_text:
                        main_result_message = "Preliminary Indication: Mid-to-Advanced Stage Symptoms for Parkinson's Detected."
                        stage_description = "Symptoms may be more noticeable at this stage. A neurologist can guide you on advanced management strategies and therapies to improve mobility and quality of life."
                        doctor_type = "Neurologist (Specialist)"
                        next_steps_advice = [
                            "Arrange an urgent consultation with a neurologist specializing in movement disorders.",
                            "Discuss advanced treatment options and multidisciplinary care approaches (e.g., speech therapy, dietetics).",
                            "Consider home modifications or assistive devices to enhance safety and independence.",
                            "Engage with support networks for emotional and practical guidance."
                        ]
                        consolation_message = "Take a deep breath. You possess incredible resilience. Focus on what brings you comfort and peace, and remember that support is always available."
                    elif "Stage 4" in predicted_stage_text:
                        main_result_message = "Preliminary Indication: Advanced Stage Symptoms for Parkinson's Detected."
                        stage_description = "At this stage, symptoms are significant. Immediate consultation with a neurologist is vital to optimize treatment, manage complications, and ensure comprehensive support."
                        doctor_type = "Neurologist (Specialist)"
                        next_steps_advice = [
                            "Seek immediate medical attention from a neurologist for comprehensive care planning.",
                            "Discuss options for managing severe motor and non-motor symptoms.",
                            "Consider palliative care or hospice care options to enhance comfort and quality of life.",
                            "Ensure a strong support system is in place, including family, caregivers, and medical professionals."
                        ]
                        consolation_message = "Even in challenging times, remember your inner strength. Focus on moments of joy and connection, and know that you are surrounded by care."
                    elif "Stage 5" in predicted_stage_text:
                        main_result_message = "Preliminary Indication: Very Advanced Stage Symptoms for Parkinson's Detected."
                        stage_description = "This indicates very advanced symptoms requiring intensive medical and supportive care. A neurologist can help in managing complex symptoms and ensuring comfort."
                        doctor_type = "Neurologist (Specialist) & Multidisciplinary Care Team"
                        next_steps_advice = [
                            "Urgent consultation with a neurologist and a multidisciplinary care team is essential.",
                            "Focus on comprehensive symptom management, comfort, and quality of life.",
                            "Discuss advanced care planning and support services for both the patient and caregivers.",
                            "Connect with specialized Parkinson's care centers for expert management."
                        ]
                        consolation_message = "Your journey is unique, and your courage shines brightly. Embrace moments of peace and know you are supported every step of the way."
                    else: # Fallback for any unexpected stage outputs
                        main_result_message = "Assessment Complete. Further Evaluation Recommended."
                        stage_description = "The assessment provides a preliminary indication. For a definitive diagnosis and personalized advice, a professional medical consultation is essential."
                        doctor_type = "Neurologist"
                        consolation_message = "Thank you for completing the assessment. Remember, early information is a step towards better health."


                else:
                    messages.error(request, f"Error: Quiz answers count ({len(user_inputs)}) does not match model's expected features ({stage_model.n_features_in_}).")
                    print(f"Error: Expected {stage_model.n_features_in_} features, got {len(user_inputs)}")
                    main_result_message = "Processing Error"
                    predicted_stage_text = "Error"
                    stage_description = "There was an issue processing your quiz answers. Please try again or contact support."
                    consolation_message = "We encountered an issue. Please try again or reach out for support."

            except Exception as e:
                messages.error(request, f"An error occurred during prediction: {e}")
                print(f"Prediction error: {e}")
                main_result_message = "Prediction Error"
                predicted_stage_text = "Error"
                stage_description = "An error occurred during prediction. Please try again or contact support."
                consolation_message = "An unexpected error occurred. Your well-being is important; please try again or contact support."
        else:
            messages.warning(request, "Prediction model not available. Results are based on default values.")
            print("Model or encoder not loaded.")
            main_result_message = "Model Not Loaded"
            predicted_stage_text = "Not Available"
            stage_description = "The prediction model could not be loaded. Please contact the administrator."
            consolation_message = "Our system is experiencing technical difficulties. We apologize for the inconvenience."
        # Prepare context for results.html with only the required data  
        # Save the assessment result to the database
        # ✅ Save the result to the database if the user is logged in and inputs are valid
        if request.user.is_authenticated and len(user_inputs) == 20:
            AssessmentResult.objects.create(
        user=request.user,
        q1=user_inputs[0],
        q2=user_inputs[1],
        q3=user_inputs[2],
        q4=user_inputs[3],
        q5=user_inputs[4],
        q6=user_inputs[5],
        q7=user_inputs[6],
        q8=user_inputs[7],
        q9=user_inputs[8],
        q10=user_inputs[9],
        q11=user_inputs[10],
        q12=user_inputs[11],
        q13=user_inputs[12],
        q14=user_inputs[13],
        q15=user_inputs[14],
        q16=user_inputs[15],
        q17=user_inputs[16],
        q18=user_inputs[17],
        q19=user_inputs[18],
        q20=user_inputs[19],
        predicted_stage=predicted_stage_text,
        main_message=main_result_message,
        stage_description=stage_description,
        doctor_type=doctor_type,
        consolation_message=consolation_message,
        )

            messages.success(request, "Your assessment has been saved successfully.")

        context = {
            'main_result_message': main_result_message,
            'potential_stage': predicted_stage_text,
            'stage_description': stage_description,
            'doctor_type': doctor_type,
            'next_steps_advice': next_steps_advice,
            'consolation_message': consolation_message,
        }

        return render(request, 'detection_app/results.html', context)

    else:
        # If accessed via GET, redirect to quiz form
        return render(request, 'detection_app/quiz.html')  
   
@login_required
def results(request):
    """
    This view is a fallback or for direct access to /results/.
    It provides default context for only the required fields.
    """
    
    context = {
        'main_result_message': "No Data Submitted", # Default for direct access
        'potential_stage': "No Data Submitted",
        'stage_description': "Please complete the assessment quiz to see your personalized results.",
        'doctor_type': "N/A",
        'next_steps_advice': ["Return to the quiz to start the assessment."],
        'consolation_message': "Welcome! Please complete the assessment to receive personalized insights.", # Default for direct access
    }
    return render(request, 'detection_app/results.html', context)


def thank_you(request):
    return render(request, 'detection_app/thank_you.html')

# -------------------------- Auth Views ----------------------------

from .forms import CustomUserCreationForm

def register_view(request):
    if request.method == 'POST':
        form = CustomUserCreationForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user)
            return redirect('home')  # or another page
    else:
        form = CustomUserCreationForm()
    return render(request, 'detection_app/register.html', {'form': form})




def login_view(request):
    if request.method == 'POST':
        form = CustomAuthenticationForm(request, data=request.POST)
        if form.is_valid():
            user = authenticate(
                request,
                username=form.cleaned_data.get('username'),
                password=form.cleaned_data.get('password')
            )
            if user is not None:
                login(request, user)
                messages.success(request, f'Login successful! Welcome back, {user.username}.')
                return redirect('home')
            else:
                messages.error(request, 'Invalid credentials.')
        else:
            for field, errors in form.errors.items():
                for error in errors:
                    messages.error(request, f"Error in {field}: {error}")
    else:
        form = CustomAuthenticationForm()
    return render(request, 'detection_app/login.html', {'form': form})


def logout_view(request):
    logout(request)
    messages.info(request, 'You have been logged out.')
    return redirect('home')


def demo_video_view(request):
    return render(request, 'detection_app/demo_video.html')


# ✅ FINAL and CORRECTED History View
@login_required
def history_view(request):
    user = request.user

    quiz_history = AssessmentResult.objects.filter(user=user)
    spiral_history = SpiralAssessmentResult.objects.filter(user=user)
    manual_history = AssessmentHistory.objects.filter(user=user)

    combined = sorted(
        chain(quiz_history, spiral_history, manual_history),
        key=attrgetter('created_at'),
        reverse=True
    )

    return render(request, 'detection_app/assessment_history.html', {
        'histories': combined
    })
@login_required
def spiral_detection(request):
    """
    Handles the upload of the spiral image and redirects to result view.
    """
    if request.method == 'POST' and request.FILES.get('spiral_image'):
        img = request.FILES['spiral_image']
        fs = FileSystemStorage(location='media/spirals')  # Store inside media/spirals/
        filename = fs.save(img.name, img)
        file_path = fs.path(filename)
        request.session['spiral_image_path'] = file_path  # Save path in session
        return redirect('spiral_result')

    return render(request, 'detection_app/spiral_detection.html')  # upload page


# ✅ Spiral Upload View
@login_required
def spiral_upload_view(request):
    if request.method == 'POST' and request.FILES.get('spiral_image'):
        img = request.FILES['spiral_image']
        fs = FileSystemStorage(location='media/spirals')
        filename = fs.save(img.name, img)
        file_path = fs.path(filename)
        request.session['spiral_image_path'] = file_path
        return redirect('spiral_result')

    return render(request, 'detection_app/spiral_detection.html')


# ✅ Spiral Result View
@login_required
def spiral_result(request):
    file_path = request.session.get('spiral_image_path')
    result = None
    image_url = None

    if file_path:
        result = predict_spiral(file_path)
        image_url = file_path.replace(os.path.abspath('media'), '/media')

        # Save to database
        SpiralAssessmentResult.objects.create(
            user=request.user,
            result=result,
            uploaded_image=file_path.replace(os.path.abspath(''), ''),  # relative path
        )

        return render(request, 'detection_app/spiral_result.html', {
        'result': result,
        'image_url': image_url
        })
    
from django.shortcuts import render

