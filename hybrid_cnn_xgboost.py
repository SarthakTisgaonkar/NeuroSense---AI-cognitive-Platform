"""
Hybrid CNN-XGBoost Parkinson's Detection Model (V2 - High Accuracy)
Architecture: PyTorch (Feature Extraction via EfficientNet-b3) + PCA + XGBoost (Classification)
Features: AugMix/PixMix Augmentation, Modified Wiener Filtering, Stratified 5-Fold CV, GridSearchCV
"""

import os
import glob
import numpy as np
import math
import cv2
from PIL import Image
import torch
import torch.nn as nn
from torchvision import models, transforms
from xgboost import XGBClassifier
from sklearn.model_selection import StratifiedKFold, GridSearchCV
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score, classification_report
from sklearn.feature_selection import RFE
from scipy.signal import wiener
import albumentations as A
import optuna
import warnings

warnings.filterwarnings('ignore', category=UserWarning)

# ==========================================
# CONFIGURATION
# ==========================================
DATA_DIRS = {
    'NewHandPD': 'dataset/NewHandPD',
    'HandPD': 'dataset/HandPD',
    'Mader': 'dataset/Mader',
    'UCI': 'dataset/UCISpiral'
}
TARGET_SIZE = 300 # EfficientNet-b3 optimal resolution
BATCH_SIZE = 32
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
TOP_FEATURES = 300 # Number of features to select via RFE

# ==========================================
# PHASE 1: PREPROCESSING & ENHANCED AUGMENTATION
# ==========================================
def modified_wiener_filter(img_array):
    """
    Applies a Modified Wiener Filter to remove scanning noise
    while heavily preserving the fine edges of tremor spirals.
    """
    # 3x3 window for edge preservation
    filtered = wiener(img_array, (3, 3))
    # Clip to valid range
    filtered = np.clip(filtered, 0, 255)
    return filtered

def augment_and_mix(image):
    """
    Enhanced AugMix for medical spiral data.
    Added Dropout and Blur to simulate varying scan quality and pen skipping features.
    """
    aug_pipeline = A.Compose([
        A.Rotate(limit=15, p=0.8, border_mode=cv2.BORDER_CONSTANT, value=255),
        A.HorizontalFlip(p=0.5),
        A.VerticalFlip(p=0.5),
        A.ElasticTransform(alpha=1.5, sigma=50, alpha_affine=50, p=0.6),
        A.GridDistortion(p=0.4),
        A.RandomBrightnessContrast(p=0.6),
        A.CoarseDropout(max_holes=10, max_height=15, max_width=15, fill_value=255, p=0.5), # Simulates missing ink
        A.GaussianBlur(blur_limit=(3, 5), p=0.3) # Simulates out-of-focus scans
    ])
    
    # 3 augmented branches
    aug1 = aug_pipeline(image=image)['image']
    aug2 = aug_pipeline(image=image)['image']
    aug3 = aug_pipeline(image=image)['image']
    
    # Mix (AugMix)
    w1, w2, w3 = np.random.dirichlet([1, 1, 1])
    mixed = (aug1 * w1 + aug2 * w2 + aug3 * w3).astype(np.uint8)
    
    # Blend with clean original
    m = np.random.beta(1.0, 1.0)
    final_mixed = (m * image + (1 - m) * mixed).astype(np.uint8)
    return final_mixed

def load_and_preprocess_image(path, apply_aug=False):
    """
    Loads -> Grayscale -> Resize -> Wiener Filter -> AugMix -> RGB Tensor Normalize
    """
    img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return None
        
    img = cv2.resize(img, (TARGET_SIZE, TARGET_SIZE))
    img = modified_wiener_filter(img).astype(np.uint8)
    
    # Triplicate channel
    img_rgb = cv2.cvtColor(img, cv2.COLOR_GRAY2RGB)
    
    if apply_aug:
        img_rgb = augment_and_mix(img_rgb)
        
    # Standard PyTorch normalization (ImageNet)
    transform = transforms.Compose([
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])
    
    return transform(Image.fromarray(img_rgb))

# ==========================================
# PHASE 1B: HANDCRAFTED CLINICAL FEATURES (Fractal & Jitter)
# ==========================================
def extract_handcrafted_features(img_path):
    """
    Computes purely geometric clinical metrics (Fractal Dimension & Angular Jitter)
    from the raw spiral image to explicitly capture tremor traits.
    """
    img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return [0.0, 0.0]
        
    img = cv2.resize(img, (224, 224))
    _, binary = cv2.threshold(img, 127, 255, cv2.THRESH_BINARY_INV)
    
    # 1. Fractal Dimension (Complexity / Jaggedness)
    def boxcount(Z, k):
        S = np.add.reduceat(np.add.reduceat(Z, np.arange(0, Z.shape[0], k), axis=0),
                            np.arange(0, Z.shape[1], k), axis=1)
        return len(np.where(S > 0)[0])
        
    Z = (binary > 0)
    sizes = 2 ** np.arange(1, 7)
    counts = [boxcount(Z, size) for size in sizes]
    
    if len(counts) > 1 and counts[-1] > 0:
        coeffs = np.polyfit(np.log(sizes), np.log(counts), 1)
        fractal_dim = -coeffs[0]
    else:
        fractal_dim = 1.0 # Baseline line
        
    # 2. Angular Jitter (High-Frequency Micro-Tremors)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        jitter = 0.0
    else:
        # Get largest contour assuming it's the main spiral
        main_contour = max(contours, key=cv2.contourArea)
        angles = []
        for i in range(2, len(main_contour)):
            p0, p1, p2 = main_contour[i-2][0], main_contour[i-1][0], main_contour[i][0]
            a = np.arctan2(p1[1]-p0[1], p1[0]-p0[0])
            b = np.arctan2(p2[1]-p1[1], p2[0]-p1[0])
            delta = np.abs(a - b)
            angles.append(delta)
        jitter = np.std(angles) if len(angles) > 0 else 0.0
        
    return [fractal_dim, jitter]

# ==========================================
# PHASE 1C: DIFFICULTY METRIC (Curriculum Learning)
# ==========================================
def extract_difficulty(img_path):
    """
    Computes Shannon Entropy to proxy spiral noise/chaos.
    """
    img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
    if img is None: return 0.0
    img = cv2.resize(img, (224, 224))
    hist = cv2.calcHist([img], [0], None, [256], [0, 256])
    hist = hist.ravel() / (hist.sum() + 1e-7)
    hist = hist[hist > 0]
    return -np.sum(hist * np.log2(hist))

# ==========================================
# PHASE 2: FEATURE EXTRACTION (EfficientNet-B3 + Handcrafted Fusion)
# ==========================================
class EfficientNetExtractor(nn.Module):
    def __init__(self):
        super().__init__()
        # Using State-of-the-Art EfficientNet-B3 for better feature fidelity
        efficientnet = models.efficientnet_b3(pretrained=True)
        
        # Freeze early layers, fine-tune later blocks
        for name, param in efficientnet.named_parameters():
            if not 'features.6' in name and not 'features.7' in name and not 'classifier' in name:
                param.requires_grad = False
            else:
                param.requires_grad = True
                
        # Remove classifier head to get 1536-dim deep features
        self.features = efficientnet.features
        self.avgpool = efficientnet.avgpool
        
    def forward(self, x):
        x = self.features(x)
        x = self.avgpool(x)
        return torch.flatten(x, 1)

def extract_features(data_loader, model, manual_features=None):
    model.eval()
    features = []
    labels = []
    
    with torch.no_grad():
        for i, (inputs, targets) in enumerate(data_loader):
            inputs = inputs.to(DEVICE)
            outputs = model(inputs).cpu().numpy()
            
            # Concatenate manual handcrafted features per image in batch if provided
            if manual_features is not None:
                start_idx = i * BATCH_SIZE
                end_idx = start_idx + len(inputs)
                batch_manual = manual_features[start_idx:end_idx]
                
                # Stack CNN features [1536] with Domain Features [2] -> [1538]
                outputs = np.hstack((outputs, batch_manual))
            
            features.append(outputs)
            labels.append(targets.numpy())
            
    return np.vstack(features), np.concatenate(labels)

# ==========================================
# DATA COMPILATION
# ==========================================
def compile_dataset(augment_multiplier=10):
    print("Compiling cross-dataset features (300x300 for EfficientNet with Geometric Traits)...")
    X_raw, y_raw, source_raw, manual_raw, diff_raw = [], [], [], [], []
    
    for db_name, db_path in DATA_DIRS.items():
        if not os.path.exists(db_path):
            continue
            
        train_path = os.path.join(db_path, 'train')
        if not os.path.exists(train_path):
            # Attempt to look in root directly if 'train' doesn't exist
            train_path = db_path
            
        for class_label, class_folder in enumerate(['0', '1']):
            folder_path = os.path.join(train_path, class_folder)
            if not os.path.exists(folder_path):
                alt_folder = 'control' if class_label == 0 else 'parkinson'
                folder_path = os.path.join(train_path, alt_folder)
                if not os.path.exists(folder_path):
                    continue
                    
            img_paths = glob.glob(os.path.join(folder_path, '*.*'))
            
            for img_path in img_paths:
                # Add Baseline
                tensor = load_and_preprocess_image(img_path, apply_aug=False)
                if tensor is not None:
                    # Compute Geometric Features on raw image
                    geom_feats = extract_handcrafted_features(img_path)
                    diff_score = extract_difficulty(img_path)
                    
                    X_raw.append(tensor)
                    y_raw.append(class_label)
                    source_raw.append(db_name)
                    manual_raw.append(geom_feats)
                    diff_raw.append(diff_score)
                    
                # Add synthetic inflations
                # For synthetic, we maintain the original geometric geometry logic but append it to inflated tensors
                for _ in range(augment_multiplier):
                    aug_tensor = load_and_preprocess_image(img_path, apply_aug=True)
                    if aug_tensor is not None:
                        geom_feats = extract_handcrafted_features(img_path) # We use original geometry for true clinical reflection
                        diff_score = extract_difficulty(img_path)
                        
                        X_raw.append(aug_tensor)
                        y_raw.append(class_label)
                        source_raw.append(db_name)
                        manual_raw.append(geom_feats)
                        diff_raw.append(diff_score)
                        
    return torch.stack(X_raw), torch.tensor(y_raw) if X_raw else (None, None), source_raw, np.array(manual_raw), np.array(diff_raw)

# ==========================================
# PHASE 3: SUPERVISED FEATURE SELECTION (RFE) & XGBOOST GRID-SEARCH
# ==========================================
def train_hybrid_eval_cv(X_features, y_labels, difficulties, k=5):
    print(f"\n--- Supervised Feature Selection (RFE) ---")
    print(f"Original Raw Feature Shape: {X_features.shape}")
    
    # Calculate global scale_pos_weight
    controls = np.sum(y_labels == 0)
    pd_cases = np.sum(y_labels == 1)
    scale_weight = controls / (pd_cases + 1e-6)
    
    # 1. Base model to evaluate feature importance
    print("Training base model to rank 1,536 dimensions...")
    base_xgb = XGBClassifier(
        n_estimators=100, max_depth=3, learning_rate=0.1, 
        scale_pos_weight=scale_weight, random_state=42, eval_metric='logloss'
    )
    
    # 2. RFE to strip away variance-heavy but non-predictive noise
    print(f"Eliminating noise... Selecting top {TOP_FEATURES} clinical features.")
    selector = RFE(estimator=base_xgb, n_features_to_select=TOP_FEATURES, step=50)
    X_selected = selector.fit_transform(X_features, y_labels)
    
    print(f"Curated Feature Shape: {X_selected.shape}")
    
    print(f"\n--- Initiating Stratified {k}-Fold Cross-Validation ---")
    skf = StratifiedKFold(n_splits=k, shuffle=True, random_state=42)
    
    fold_metrics = {'acc': [], 'f1': [], 'auc': []}
    
    for fold, (train_idx, val_idx) in enumerate(skf.split(X_selected, y_labels)):
        X_train, X_val = X_selected[train_idx], X_selected[val_idx]
        y_train, y_val = y_labels[train_idx], y_labels[val_idx]
        
        # Grid Search for optimal hyperparameters on this fold
        param_grid = {
            'max_depth': [3, 5, 7],
            'learning_rate': [0.01, 0.05, 0.1],
            'n_estimators': [150, 300, 500],
            'subsample': [0.7, 0.9]
        }
        
        xgb_fold = XGBClassifier(random_state=42, eval_metric='logloss', scale_pos_weight=scale_weight)
        
        grid_search = GridSearchCV(estimator=xgb_fold, param_grid=param_grid, scoring='f1', cv=3, n_jobs=-1, verbose=0)
        grid_search.fit(X_train, y_train)
        
        best_xgb = grid_search.best_estimator_
        
        y_pred = best_xgb.predict(X_val)
        y_prob = best_xgb.predict_proba(X_val)[:, 1]
        
        acc = accuracy_score(y_val, y_pred)
        f1 = f1_score(y_val, y_pred)
        auc = roc_auc_score(y_val, y_prob)
        
        fold_metrics['acc'].append(acc)
        fold_metrics['f1'].append(f1)
        fold_metrics['auc'].append(auc)
        
        print(f"Fold {fold+1}: Acc: {acc:.4f} | F1: {f1:.4f} | AUC: {auc:.4f} | Best Params: {grid_search.best_params_}")
        
    print("\n--- Stratified K-Fold Validation Summary ---")
    print(f"Mean Accuracy : {np.mean(fold_metrics['acc']):.4f} ± {np.std(fold_metrics['acc']):.4f}")
    print(f"Mean F1 Score : {np.mean(fold_metrics['f1']):.4f}")
    print(f"Mean AUC      : {np.mean(fold_metrics['auc']):.4f}")
    
    print("\nTraining Final Master XGBoost Model using Curriculum Learning (Difficulty-Tiered)...")
    
    # Sort dataset by difficulty (Entropy)
    sort_idx = np.argsort(difficulties)
    X_sorted = X_selected[sort_idx]
    y_sorted = y_labels[sort_idx]
    
    n_samples = len(y_sorted)
    q1 = n_samples // 4
    q3 = n_samples - q1
    
    X_easy, y_easy = X_sorted[:q1], y_sorted[:q1]
    X_med, y_med = X_sorted[q1:q3], y_sorted[q1:q3]
    X_hard, y_hard = X_sorted[q3:], y_sorted[q3:]
    
    final_xgb = XGBClassifier(
        learning_rate=0.05, max_depth=5, n_estimators=100, subsample=0.9, 
        scale_pos_weight=scale_weight, random_state=42, eval_metric='logloss'
    )
    
    def has_both_classes(y):
        return len(np.unique(y)) > 1

    if has_both_classes(y_easy) and has_both_classes(y_med) and has_both_classes(y_hard):
        print("Phase 1: Training on Easy samples (Lowest 25% Entropy)...")
        final_xgb.fit(X_easy, y_easy)
        
        print("Phase 2: Training on Medium samples (Middle 50% Entropy)...")
        final_xgb.fit(X_med, y_med, xgb_model=final_xgb.get_booster())
        
        print("Phase 3: Training on Hard samples (Highest 25% Entropy)...")
        final_xgb.fit(X_hard, y_hard, xgb_model=final_xgb.get_booster())
    else:
        print("Warning: Class imbalance in difficulty tiers. Reverting to standard training.")
        final_xgb.n_estimators = 300
        final_xgb.fit(X_sorted, y_sorted)
    
    # Save Models
    import joblib
    joblib.dump(selector, 'hybrid_rfe_selector.pkl')
    final_xgb.save_model("hybrid_xgboost_head.json")
    print("✅ Final RFE Selector saved to 'hybrid_rfe_selector.pkl'")
    print("✅ Final XGBoost head saved to 'hybrid_xgboost_head.json'")
    
    return final_xgb, selector


def cross_dataset_eval(X_features, y_labels, sources, selector=None):
    print(f"\n--- Cross-Dataset Evaluation (Generalization Test) ---")
    
    unique_datasets = np.unique(sources)
    if len(unique_datasets) < 2:
        print("Only one dataset found. Skipping cross-dataset evaluation.")
        return
        
    # Standardize via RFE selection if provided, else run full feature reduction uniquely
    if selector:
        X_selected = selector.transform(X_features)
    else:
        # Emergency fallback if somehow selector isn't provided
        base_xgb = XGBClassifier(n_estimators=100, max_depth=3, learning_rate=0.1, random_state=42)
        selector = RFE(estimator=base_xgb, n_features_to_select=TOP_FEATURES, step=50)
        X_selected = selector.fit_transform(X_features, y_labels)
        
    for holdout in unique_datasets:
        # Train on all EXCEPT holdout, Test ON holdout
        train_mask = sources != holdout
        test_mask = sources == holdout
        
        X_train, y_train = X_selected[train_mask], y_labels[train_mask]
        X_test, y_test = X_selected[test_mask], y_labels[test_mask]
        
        if len(np.unique(y_test)) < 2 or len(np.unique(y_train)) < 2:
            print(f"Skipping {holdout} holdout due to missing classes (Needs both PD & Control).")
            continue
            
        controls = np.sum(y_train == 0)
        pd_cases = np.sum(y_train == 1)
        scale_weight = controls / (pd_cases + 1e-6)
        
        xgb = XGBClassifier(
            learning_rate=0.05, max_depth=5, n_estimators=300, subsample=0.9, 
            scale_pos_weight=scale_weight, random_state=42, eval_metric='logloss'
        )
        xgb.fit(X_train, y_train)
        
        y_pred = xgb.predict(X_test)
        y_prob = xgb.predict_proba(X_test)[:, 1]
        
        acc = accuracy_score(y_test, y_pred)
        f1 = f1_score(y_test, y_pred)
        auc = roc_auc_score(y_test, y_prob)
        
        print(f"Holdout: {holdout:12} | "
              f"Train:{len(y_train):5} | Test:{len(y_test):5} | "
              f"Acc: {acc:.4f} | F1: {f1:.4f} | AUC: {auc:.4f}")


def run_pipeline():
    print("1. Data Preparation (Multiple Dataset Strategy, EfficientNet Sizing & Handcrafted extraction)")
    X_tensors, y_tensors, sources, manual_features, difficulties = compile_dataset(augment_multiplier=12) 
    
    if X_tensors is None:
        print("No image data found in specified directories. Terminating pipeline.")
        return
        
    dataset = torch.utils.data.TensorDataset(X_tensors, y_tensors)
    data_loader = torch.utils.data.DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=False)
    
    print("\n2. Feature Extraction (State-of-the-Art EfficientNet-B3 + Geometric Concatenation)")
    extractor = EfficientNetExtractor().to(DEVICE)
    X_features, y_labels = extract_features(data_loader, extractor, manual_features)
    
    # Optional: Save PyTorch Extractor
    torch.save(extractor.state_dict(), 'efficientnet_b3_extractor.pth')
    print("✅ EfficientNet-B3 feature extractor architecture saved.")
    
    print(f"Extracted a {X_features.shape[1]}-dimensional block across {X_features.shape[0]} samples.")
    
    print("\n3. Classification & Evaluation (RFE Supervised Selection + XGBoost GridSearchCV + Stratified K-Fold)")
    final_model, rfe_selector = train_hybrid_eval_cv(X_features, y_labels, difficulties, k=5)
    
    print("\n4. Cross-Dataset Generalization Validation")
    cross_dataset_eval(X_features, y_labels, np.array(sources), rfe_selector)


if __name__ == '__main__':
    # run_pipeline()
    print("High-Accuracy Hybrid Pipeline Setup Complete.")
