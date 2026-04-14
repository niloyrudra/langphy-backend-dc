from fastapi import FastAPI
from app.nlp import analyze_text, analyze_lesson, analyze_answer, analyze_speaking
from app.schemas import AnalyzeRequest, LessonRequest, AnswerRequest, SpeechRequest

app = FastAPI(title="Langphy NLP Service")

@app.post("/api/nlp/analyze")
def analyze_text_data(req: AnalyzeRequest):
    return analyze_text(req.text)

@app.post("/api/nlp/analyze/lesson")
def analyze_lesson_data(req: LessonRequest):
    return analyze_lesson( req.text )


@app.post("/api/nlp/analyze/answer")
def analyze_answer_data(data: AnswerRequest):
    return analyze_answer( data.expected, data.user_answer )

@app.post("/api/nlp/analyze/evaluate-speaking")
def analyze_speaking_data(data: SpeechRequest):
    return analyze_speaking( data.expected_text, data.spoken_text )