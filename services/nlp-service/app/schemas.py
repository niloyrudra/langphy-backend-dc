from pydantic import BaseModel

class AnalyzeRequest(BaseModel):
    text: str

class LessonRequest(BaseModel):
    text: str

class AnswerRequest(BaseModel):
    expected: str
    user_answer: str

class SpeechRequest(BaseModel):
    expected_text: str
    spoken_text: str