import requests
import base64
import sys

def test_api():
    try:
        # Just use one of the test images
        with open('dataset/test_image_parkinson.png', 'rb') as fp:
            img_b64 = base64.b64encode(fp.read()).decode('utf-8')
            
        print("Sending request to localhost:5000/predict/spiral")
        resp = requests.post('http://localhost:5000/predict/spiral', json={'image': 'data:image/png;base64,' + img_b64})
        
        print("Status Code:", resp.status_code)
        print("Response JSON:")
        print(resp.json())
        
    except Exception as e:
        print("Error testsing API:", e)

if __name__ == '__main__':
    test_api()
