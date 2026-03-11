"""
Grad-CAM Explainability Generator for Hybrid CNN-XGBoost Parkinson's Model
"""
import os
import cv2
import numpy as np
import torch
from PIL import Image
from torchvision import models, transforms

# Try to import our custom extractor from the hybrid script if in same dir
try:
    from hybrid_cnn_xgboost import EfficientNetExtractor, load_and_preprocess_image
except ImportError:
    pass

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

def apply_gradcam(extractor_model, image_tensor, target_layer_name='features.7'):
    """
    Generates a Grad-CAM heatmap for a given PyTorch EfficientNet extractor.
    Since the base extractor doesn't have a direct classification block (we use XGBoost),
    we compute gradients with respect to the mean of the feature vector to map 
    which physical zones triggered the highest feature activations.
    """
    extractor_model.eval()
    
    # Hook for gradients
    gradients = []
    activations = []
    
    def backward_hook(module, grad_input, grad_output):
        gradients.append(grad_output[0])
        
    def forward_hook(module, input, output):
        activations.append(output)
        
    # Register hooks on the target layer (e.g., last conv block)
    target_layer = None
    for name, module in extractor_model.named_modules():
        if name == target_layer_name:
            target_layer = module
            break
            
    if target_layer is None:
        print(f"Target layer {target_layer_name} not found.")
        return None
        
    f_hook = target_layer.register_forward_hook(forward_hook)
    b_hook = target_layer.register_full_backward_hook(backward_hook)
    
    # Forward pass
    image_tensor.requires_grad = True
    features = extractor_model(image_tensor)
    
    # Backpropagate the L2 norm of the features to see what parts of the image activate strongest.
    loss = features.norm()
    
    extractor_model.zero_grad()
    loss.backward()
    
    f_hook.remove()
    b_hook.remove()
    
    if len(gradients) == 0 or len(activations) == 0:
        return None
        
    grads = gradients[0].cpu().data.numpy().squeeze()
    acts = activations[0].cpu().data.numpy().squeeze()
    
    # Global average pooling of gradients
    weights = np.mean(grads, axis=(1, 2))
    
    # Weighted combination of activations
    cam = np.zeros(acts.shape[1:], dtype=np.float32)
    for i, w in enumerate(weights):
        cam += w * acts[i]
        
    cam = np.maximum(cam, 0) # ReLU
    cam = cv2.resize(cam, (224, 224))
    cam = cam - np.min(cam)
    if np.max(cam) != 0:
        cam = cam / np.max(cam)
        
    return cam

def overlay_heatmap(img_path, heatmap, alpha=0.5):
    """
    Applies the heatmap physically over the original image.
    Color-coded: Red (high implication), Blue (low implication)
    """
    img = cv2.imread(img_path)
    if img is None:
        return None
    img = cv2.resize(img, (224, 224))
    
    heatmap_colored = cv2.applyColorMap(np.uint8(255 * heatmap), cv2.COLORMAP_JET)
    superimposed = cv2.addWeighted(heatmap_colored, alpha, img, 1 - alpha, 0)
    
    return superimposed

def generate_and_save_gradcam(img_path, output_path="gradcam_output.png"):
    print("1. Loading AI Model for Explainability Analysis...")
    model = models.efficientnet_b3(pretrained=True).to(DEVICE)
    # The last conv layer in standard PyTorch EfficientNet-B3 is features.7
    
    transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])
    
    print("2. Mapping Spiral Contours and Neural Activations...")
    img = Image.open(img_path).convert('RGB')
    tensor = transform(img).unsqueeze(0).to(DEVICE)
    
    heatmap = apply_gradcam(model, tensor, target_layer_name='features.7')
    if heatmap is not None:
        result_img = overlay_heatmap(img_path, heatmap)
        cv2.imwrite(output_path, result_img)
        print(f"✅ Grad-CAM Explainability heatmap saved successfully to {output_path}")
    else:
        print("Failed to generate Grad-CAM.")

if __name__ == "__main__":
    print("=== PyTorch Grad-CAM Explainability System HQ ===")
    print("To run, import generating functions: generate_and_save_gradcam(input, output)")
