# detection_app/forms.py
from django.contrib.auth.forms import AuthenticationForm, UserCreationForm
from django.contrib.auth.models import User
from django import forms

class CustomAuthenticationForm(AuthenticationForm):
    """
    Custom form for user login with Tailwind CSS styling.
    """
    username = forms.CharField(
        widget=forms.TextInput(attrs={
            'placeholder': 'Enter your username',
            'class': 'form-input-field'
        })
    )
    password = forms.CharField(
        widget=forms.PasswordInput(attrs={
            'placeholder': 'Enter your password',
            'class': 'form-input-field'
        })
    )


class CustomUserCreationForm(UserCreationForm):
    """
    Custom registration form including email + Tailwind styling.
    """
    email = forms.EmailField(required=True, widget=forms.EmailInput(attrs={
        'placeholder': 'Enter your email',
        'class': 'form-input-field',
    }))

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field_name in self.fields:
            self.fields[field_name].widget.attrs.update({
                'class': 'input-field',
                'placeholder': self.fields[field_name].label,
            })

    class Meta:
        model = User
        fields = ('username', 'email', 'password1', 'password2')
