import sys
print("Python:", sys.executable)
print("Version:", sys.version)
print("Path:")
for p in sys.path:
    print("  ", p)
print()

packages = ['librosa', 'imageio_ffmpeg', 'flask', 'flask_cors', 'cv2', 'numpy', 'tensorflow', 'PIL']
for pkg in packages:
    try:
        __import__(pkg)
        print(f"OK: {pkg}")
    except ImportError as e:
        print(f"FAIL: {pkg} -> {e}")
