"""Tests for the CODEOWNERS default-owner check."""

from scripts.codeowners import default_owners, is_single_codeowner


def test_single_user_owner():
    assert default_owners("* @alice\n") == ["@alice"]
    assert is_single_codeowner("* @alice\n") is True


def test_several_owners():
    text = "* @alice @bob\n"
    assert default_owners(text) == ["@alice", "@bob"]
    assert is_single_codeowner(text) is False


def test_last_star_line_wins():
    text = "* @alice\n/docs/ @carol\n* @alice @bob\n"
    assert default_owners(text) == ["@alice", "@bob"]


def test_other_patterns_are_ignored():
    text = "/code/ @alice @bob\n*.md @carol\n* @dave\n"
    assert default_owners(text) == ["@dave"]
    assert is_single_codeowner(text) is True


def test_team_counts_as_several_people():
    assert is_single_codeowner("* @camaraproject/some-team\n") is False


def test_comments_and_blank_lines_are_skipped():
    text = "# owners\n\n* @alice  # inline comment\n"
    assert default_owners(text) == ["@alice"]


def test_email_owner():
    assert default_owners("* alice@example.com\n") == ["alice@example.com"]
    assert is_single_codeowner("* alice@example.com\n") is True


def test_no_star_line_is_undetermined():
    assert default_owners("/docs/ @alice\n") is None
    assert is_single_codeowner("/docs/ @alice\n") is None


def test_star_line_without_owner_is_undetermined():
    # A bare "*" line removes ownership; there is no codeowner to count.
    assert default_owners("*\n") == []
    assert is_single_codeowner("*\n") is None
