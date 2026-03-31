import requests

url = 'http://localhost:5000/predict/voice'
file_path = r'D:\Internship\Pd\Parkinson 10 07 2025\sanchit.wav'

with open(file_path, 'rb') as f:
    files = {'audio': (file_path, f, 'audio/wav')}
    response = requests.post(url, files=files)
    
print(f"Status: {response.status_code}")
print(f"Response: {response.text}")
