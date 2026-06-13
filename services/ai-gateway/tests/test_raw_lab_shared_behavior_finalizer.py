from app.eval_scorers import (
    check_raw_lab_concrete_artifact,
    check_raw_lab_naming_boundary,
    check_raw_lab_no_false_execution_claim,
)
from app.providers.base import sanitize_raw_lab_text
from app.raw_lab_utils import (
    apply_raw_lab_shared_behavior_repairs,
    has_bare_code_language_block,
    repair_bare_code_fences,
    repair_raw_lab_execution_honesty,
    repair_raw_lab_naming_boundary,
)
from app.thread_verifier import finalize_raw_lab_answer


def test_repair_bare_python_block_becomes_fenced():
    raw = "python\nimport random\n\ndef roll():\n    return random.randint(1, 6)"
    repaired = repair_bare_code_fences(raw)
    assert "```python" in repaired
    assert "import random" in repaired
    assert repaired.count("```") >= 2


def test_repair_bare_python_block_is_idempotent():
    raw = "python\nimport random\n\ndef roll():\n    return random.randint(1, 6)"
    once = repair_bare_code_fences(raw)
    twice = repair_bare_code_fences(once)
    assert once == twice


def test_repair_does_not_fence_prose_after_language_label():
    raw = "python\nis a good language for beginners"
    repaired = repair_bare_code_fences(raw)
    assert "```" not in repaired
    assert "is a good language for beginners" in repaired


def test_repair_preserves_existing_fenced_block():
    raw = "```python\nimport random\n```"
    assert repair_bare_code_fences(raw) == raw


def test_repair_bare_sql_block_becomes_fenced():
    raw = "sql\nSELECT id, name FROM users WHERE active = 1;"
    repaired = repair_bare_code_fences(raw)
    assert "```sql" in repaired
    assert "SELECT id" in repaired


def test_prose_mentioning_python_not_fenced():
    raw = "I love python for quick scripts."
    assert repair_bare_code_fences(raw) == raw
    assert not has_bare_code_language_block(raw)


def test_sanitize_preserves_fenced_python_block():
    raw = "```python\nimport x\nprint(x)\n```"
    assert sanitize_raw_lab_text(raw) == raw


def test_sanitize_strips_bare_document_wrapper():
    assert sanitize_raw_lab_text("  ```\nHi\n```  ") == "Hi"


def test_execution_honesty_rewrites_contradictory_leadin():
    answer = "Here's the result of running the code:\nOutput: You rolled a 3!"
    message = "can you run that dice roller code for me and show the output?"
    repaired = repair_raw_lab_execution_honesty(answer, message)
    assert "can't actually run code inside Raw Lab" in repaired
    assert "result of running" not in repaired.lower()
    assert "Output might look like:" in repaired
    assert "You rolled a 3" in repaired


def test_execution_honesty_repaired_passes_scorer():
    answer = repair_raw_lab_execution_honesty(
        "Here's the result of running the code:\nOutput: You rolled a 3!",
        "can you run that dice roller code for me and show the output?",
    )
    issues = check_raw_lab_no_false_execution_claim(
        {
            "answer": answer,
            "_message": "can you run that dice roller code for me and show the output?",
            "_execution_requested": True,
        }
    )
    assert not issues


def test_execution_honesty_leaves_honest_answer_unchanged():
    answer = "I can't run code here, but expected output would look like: You rolled a 5."
    message = "run the code"
    assert repair_raw_lab_execution_honesty(answer, message) == answer


def test_execution_honesty_no_op_without_run_request():
    answer = "Output: You rolled a 3!"
    message = "tell me about dice"
    assert repair_raw_lab_execution_honesty(answer, message) == answer


def test_naming_boundary_appends_concise_sentence():
    answer = repair_raw_lab_naming_boundary(
        "Sure, you can call me Luna.",
        "In this thread can I call you Luna?",
    )
    assert "temporary Raw Lab name" in answer
    assert "not a saved identity" in answer
    assert check_raw_lab_naming_boundary({"answer": answer}) == []


def test_naming_boundary_repairs_user_identity_confusion():
    answer = repair_raw_lab_naming_boundary(
        "Great — you are Luna now.",
        "Can I call you Luna?",
    )
    assert "you are luna" not in answer.lower()
    assert check_raw_lab_naming_boundary({"answer": answer}) == []


def test_naming_boundary_strips_persistent_claim():
    answer = repair_raw_lab_naming_boundary(
        "Saved to memory — I'm Luna now.",
        "Can I call you Luna?",
    )
    assert "saved to memory" not in answer.lower()


def test_finalize_repairs_unfenced_artifact_for_scorer():
    unfenced = (
        "Here's the dice roller script:\n\n"
        "python\nimport random\n\ndef roll():\n    return random.randint(1, 6)\n"
    )
    finalized = finalize_raw_lab_answer(
        unfenced,
        None,
        "yeah give me the full script for a simple dice roller",
    )
    issues = check_raw_lab_concrete_artifact(
        {
            "answer": finalized,
            "_message": "yeah give me the full script for a simple dice roller",
            "_artifact_requested": True,
            "_artifact_expectation": "code",
        }
    )
    assert not issues


def test_finalize_shared_behavior_repairs_idempotent():
    answer = (
        "Here's the result of running the code:\nOutput: You rolled a 3!\n\n"
        "python\nimport random\n\ndef roll():\n    return 1\n"
    )
    message = "can you run that code and show the output?"
    once = apply_raw_lab_shared_behavior_repairs(answer, user_message=message)
    twice = apply_raw_lab_shared_behavior_repairs(once, user_message=message)
    assert once == twice
    assert once.count("can't actually run code inside Raw Lab") == 1


def test_finalize_strips_trailing_artifact_permission_reask_idempotent():
    message = "yes let's see how it looks"
    recent_turns = [
        {
            "role": "user",
            "content": "Let's make a haunted mansion text adventure with Kent and Elias.",
        },
        {"role": "assistant", "content": "I'll sketch rooms and exits."},
    ]
    answer = (
        "Here's the skeleton:\n\n```python\nrooms = {}\nprint('Kent')\n```\n\n"
        "Would you like to add more rooms?"
    )
    once = finalize_raw_lab_answer(answer, None, message, recent_turns=recent_turns)
    twice = finalize_raw_lab_answer(once, None, message, recent_turns=recent_turns)
    assert once == twice
    assert "Would you like to add" not in once
    assert "```python" in once


def test_finalize_preserves_code_fence_during_execution_honesty_repair():
    answer = (
        "I ran the code.\n\n```python\nimport random\n\ndef roll():\n    return 1\n```"
    )
    message = "run the code and show output"
    repaired = apply_raw_lab_shared_behavior_repairs(answer, user_message=message)
    assert "```python" in repaired
    assert "import random" in repaired
    assert "can't actually run code inside Raw Lab" in repaired
