_ready: bool = False

def set_ready() -> None:
    global _ready
    _ready = True

def is_ready() -> bool:
    return _ready