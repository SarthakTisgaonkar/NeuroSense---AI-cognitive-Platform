from django.db import models
from django.contrib.auth.models import User

class AssessmentResult(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    
    # Store all 20 quiz answers
    q1 = models.IntegerField()
    q2 = models.IntegerField()
    q3 = models.IntegerField()
    q4 = models.IntegerField()
    q5 = models.IntegerField()
    q6 = models.IntegerField()
    q7 = models.IntegerField()
    q8 = models.IntegerField()
    q9 = models.IntegerField()
    q10 = models.IntegerField()
    q11 = models.IntegerField()
    q12 = models.IntegerField()
    q13 = models.IntegerField()
    q14 = models.IntegerField()
    q15 = models.IntegerField()
    q16 = models.IntegerField()
    q17 = models.IntegerField()
    q18 = models.IntegerField()
    q19 = models.IntegerField()
    q20 = models.IntegerField()

    # Prediction output
    predicted_stage = models.CharField(max_length=50)
    main_message = models.TextField()
    stage_description = models.TextField()
    doctor_type = models.CharField(max_length=100)
    consolation_message = models.TextField()

    # Timestamp
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} - {self.predicted_stage} - {self.created_at.date()}"
    from django.db import models
from django.contrib.auth.models import User

class PatientProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    age = models.IntegerField(null=True, blank=True)
    gender = models.CharField(max_length=10, choices=[('Male', 'Male'), ('Female', 'Female')], null=True, blank=True)
    contact_number = models.CharField(max_length=15, null=True, blank=True)

    def __str__(self):
        return f"{self.user.username}'s Profile"

class AssessmentHistory(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    result = models.CharField(max_length=200)
    date_taken = models.DateTimeField(auto_now_add=True)
    test_type = models.CharField(max_length=50)

    def __str__(self):
        return f"{self.user.username} - {self.test_type} ({self.date_taken.strftime('%Y-%m-%d')})"

class SpiralAssessmentResult(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    # Result can be "Parkinson Detected" or "Healthy Drawing"
    result = models.CharField(max_length=100)
    uploaded_image = models.ImageField(upload_to='spirals/')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} - {self.result} - {self.created_at.strftime('%Y-%m-%d')}"
