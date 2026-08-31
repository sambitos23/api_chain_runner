"""Tests for backward-compatible dependent-step condition operators."""

import pytest

from api_chain_runner.models import ConditionConfig
from api_chain_runner.runner import ChainRunner


@pytest.mark.parametrize(
    ("actual", "operator", "expected", "result"),
    [
        ("okyc", "equals", "okyc", True),
        ("okyc", "not_equals", "udyam", True),
        (["okyc", "udyam"], "contains", "okyc", True),
        (["okyc", "udyam"], "not_contains", "pan", True),
        (10, "greater_than", "5", True),
        (10, "greater_than_or_equal", "10", True),
        (10, "less_than", "20", True),
        (10, "less_than_or_equal", "10", True),
        ("APPROVED", "starts_with", "APP", True),
        ("APPROVED", "ends_with", "VED", True),
        (None, "is_null", "", True),
        ("value", "is_not_null", "", True),
    ],
)
def test_condition_operators(actual, operator, expected, result):
    condition = ConditionConfig(
        step="source", key_path="value", expected_value=expected, operator=operator
    )
    assert ChainRunner.condition_matches(actual, condition) is result


def test_legacy_condition_defaults_to_equals():
    condition = ConditionConfig(step="source", key_path="status", expected_value="READY")
    assert condition.operator == "equals"
    assert ChainRunner.condition_matches("READY", condition)
    assert not ChainRunner.condition_matches("PENDING", condition)


def test_unknown_operator_is_rejected_when_loading(tmp_path):
    flow = tmp_path / "flow.yaml"
    flow.write_text(
        "chain:\n"
        "  - name: dependent\n"
        "    url: https://example.test\n"
        "    method: GET\n"
        "    condition:\n"
        "      step: source\n"
        "      key_path: status\n"
        "      operator: unknown\n"
        "      expected_value: READY\n",
        encoding="utf-8",
    )
    with pytest.raises(Exception, match="invalid condition operator"):
        ChainRunner(str(flow))
