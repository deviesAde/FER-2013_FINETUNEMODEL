from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import uvicorn, cv2, numpy as np, tensorflow as tf, base64, io
from tensorflow.keras.models import load_model
from PIL import Image

app = FastAPI(title="Cosmic Stress API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

try:
    model = load_model('model_stress4_finetuned.h5')
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    class_names = ['focus', 'neutral', 'non_stress', 'stress']
except Exception as e:
    model = None

class ImageRequest(BaseModel):
    image: str
    videoId: str = "unknown"

def preprocess_face(face_roi):
    if len(face_roi.shape) == 3: face_gray = cv2.cvtColor(face_roi, cv2.COLOR_BGR2GRAY)
    else: face_gray = face_roi
    face_resized = cv2.resize(face_gray, (48, 48))
    face_input = (face_resized / 255.0).reshape(1, 48, 48, 1)
    return face_input

@app.post("/analyze-frame")
async def analyze_frame(request: ImageRequest):
    if model is None: raise HTTPException(status_code=500, detail="Model not loaded")
    try:
        header, encoded = request.image.split(",", 1)
        frame = cv2.cvtColor(np.array(Image.open(io.BytesIO(base64.b64decode(encoded)))), cv2.COLOR_RGB2BGR)
        faces = face_cascade.detectMultiScale(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), 1.1, 5, minSize=(30, 30))
        detections = []
        if len(faces) > 0:
            face_inputs = np.vstack([preprocess_face(frame[y:y+h, x:x+w]) for (x, y, w, h) in faces])
            preds = model.predict(face_inputs, verbose=0)
            for i, (x, y, w, h) in enumerate(faces):
                idx = np.argmax(preds[i])
                detections.append({"label": class_names[idx], "score": float(preds[i][idx]), "box": [int(x), int(y), int(w), int(h)]})
        return {"videoId": request.videoId, "detections": detections}
    except Exception as e: return {"videoId": request.videoId, "detections": []}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
