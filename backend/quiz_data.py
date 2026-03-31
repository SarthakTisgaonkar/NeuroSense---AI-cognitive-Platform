# detection_app/quiz_data.py

questions = [
    {"question_text": "Do you experience tremors in hands, arms, legs, jaw, or head?", "name": "q1"},
    {"question_text": "Have you noticed slowness in daily movements like walking or eating?", "name": "q2"},
    {"question_text": "Do you experience stiffness or rigidity in limbs or trunk?", "name": "q3"},
    {"question_text": "Do you have trouble with balance or tend to fall?", "name": "q4"},
    {"question_text": "Has your walking changed (e.g., shuffling, slow start)?", "name": "q5"},
    {"question_text": "Do you lean forward or stoop while walking?", "name": "q6"},
    {"question_text": "Has your face become less expressive or more blank?", "name": "q7"},
    {"question_text": "Do your arms swing less while walking?", "name": "q8"},
    {"question_text": "Has your handwriting become smaller or harder to read?", "name": "q9"},
    {"question_text": "Do you struggle with fine finger tasks like buttoning clothes?", "name": "q10"},
    {"question_text": "Do you have trouble smelling things (loss of smell)?", "name": "q11"},
    {"question_text": "Do you act out dreams (e.g., punch, kick, talk)?", "name": "q12"},
    {"question_text": "Do you feel sleepy during the day despite full sleep?", "name": "q13"},
    {"question_text": "Do you feel anxious, depressed, or disinterested?", "name": "q14"},
    {"question_text": "Do you forget things or struggle to make decisions?", "name": "q15"},
    {"question_text": "Do you feel dizzy or faint when you stand up?", "name": "q16"},
    {"question_text": "Do you feel constipated frequently?", "name": "q17"},
    {"question_text": "Have others noticed changes in behavior or thinking?", "name": "q18"},
    {"question_text": "Are there any symptoms that bother you which haven’t been asked?", "name": "q19"},
    {"question_text": "Have you been diagnosed with Parkinson's disease by a medical professional?", "name": "q20"}, # Added a 20th question if your model expects 20 features
]

# CORRECTED: These options now match your model's training categories
option_choices = ["Never", "Rarely", "Sometimes", "Often", "Always"]
