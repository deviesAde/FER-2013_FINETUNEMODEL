import cv2
import numpy as np
import tensorflow as tf
from tensorflow.keras.models import load_model


print("🔍 Loading stress detection model...")
model = load_model('model_stress4_finetuned.h5')  

# === 2. Define Classes ===
class_names = ['focus', 'neutral', 'non_stress', 'stress']
class_colors = {
    'focus': (255, 255, 0),    # Kuning
    'neutral': (0, 255, 0),    # Hijau
    'non_stress': (0, 165, 255),  # Orange
    'stress': (0, 0, 255)      # Merah
}

# === 3. Load Face Detector ===
print("🔍 Loading face detector...")
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

# === 4. Fungsi Preprocessing ===
def preprocess_face(face_roi):
    """Preprocess face ROI untuk model"""
    # Convert ke grayscale jika perlu
    if len(face_roi.shape) == 3:
        face_gray = cv2.cvtColor(face_roi, cv2.COLOR_BGR2GRAY)
    else:
        face_gray = face_roi
    
    # Resize ke 48x48 (sesuai model)
    face_resized = cv2.resize(face_gray, (48, 48))
    
    # Normalisasi
    face_normalized = face_resized / 255.0
    
    # Reshape untuk model (1, 48, 48, 1)
    face_input = face_normalized.reshape(1, 48, 48, 1)
    
    return face_input

# === 5. Fungsi Predict ===
def predict_stress(face_input):
    """Predict stress level dari face ROI"""
    predictions = model.predict(face_input, verbose=0)
    predicted_class = class_names[np.argmax(predictions[0])]
    confidence = np.max(predictions[0])
    
    return predicted_class, confidence, predictions[0]

# === 6. Main Webcam Loop ===
def run_webcam_detection():
    print("🎥 Starting webcam...")
    print("📝 Controls:")
    print("   - Press 'q' to quit")
    print("   - Press 's' to save current frame")
    
    cap = cv2.VideoCapture(0)
    
    # Set camera resolution
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    
    saved_count = 0
    
    while True:
        ret, frame = cap.read()
        if not ret:
            print("❌ Failed to grab frame")
            break
        
        # Convert ke grayscale untuk face detection
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Detect faces
        faces = face_cascade.detectMultiScale(
            gray, 
            scaleFactor=1.1, 
            minNeighbors=5, 
            minSize=(30, 30)
        )
        
        # Process each face
        for (x, y, w, h) in faces:
           
            face_roi = frame[y:y+h, x:x+w]
            
           
            face_input = preprocess_face(face_roi)
            
           
            predicted_class, confidence, all_probs = predict_stress(face_input)
            
           
            color = class_colors[predicted_class]
            
            cv2.rectangle(frame, (x, y), (x+w, y+h), color, 2)
            
        
            text = f"{predicted_class} ({confidence:.2f})"
            
           
            text_size = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)[0]
            cv2.rectangle(frame, (x, y-30), (x+text_size[0], y), color, -1)
            cv2.rectangle(frame, (x, y-30), (x+text_size[0], y), color, 2)
            
            # Put text
            cv2.putText(frame, text, (x, y-10), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
            
            
            bar_width = 80
            bar_height = 15
            start_x = x
            start_y = y + h + 10
            
            for i, (cls, prob) in enumerate(zip(class_names, all_probs)):
               
                cv2.rectangle(frame, 
                            (start_x, start_y + i*(bar_height+5)), 
                            (start_x + bar_width, start_y + bar_height + i*(bar_height+5)), 
                            (50, 50, 50), -1)
                
              
                fill_width = int(prob * bar_width)
                cv2.rectangle(frame, 
                            (start_x, start_y + i*(bar_height+5)), 
                            (start_x + fill_width, start_y + bar_height + i*(bar_height+5)), 
                            class_colors[cls], -1)
                
                # Bar text
                bar_text = f"{cls}: {prob:.2f}"
                cv2.putText(frame, bar_text, 
                          (start_x + bar_width + 5, start_y + 12 + i*(bar_height+5)), 
                          cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
        
       
        cv2.putText(frame, "Press 'q' to quit | 's' to save", 
                   (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        cv2.putText(frame, "Press 'q' to quit | 's' to save", 
                   (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 1)
        
        
        cv2.imshow('Stress Detection - Webcam', frame)
        
       
        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord('s'):
            # Save current frame
            saved_count += 1
            filename = f"stress_capture_{saved_count}.jpg"
            cv2.imwrite(filename, frame)
            print(f"💾 Saved: {filename}")
    
    # Cleanup
    cap.release()
    cv2.destroyAllWindows()
    print("👋 Webcam closed")

# === 7. Run Program ===
if __name__ == "__main__":
    print("🎯 REAL-TIME STRESS DETECTION")
    print("=" * 40)
    run_webcam_detection()