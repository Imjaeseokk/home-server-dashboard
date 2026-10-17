import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from app.main import FILE_ROOTS, get_files


class FilesystemVisibilityTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.root = self.base / "files"
        self.root.mkdir()
        roots = patch.dict(FILE_ROOTS, {"test": {"name": "Test", "path": self.root}})
        roots.start()
        self.addCleanup(roots.stop)

    def assert_status(self, subpath, expected):
        with self.assertRaises(HTTPException) as error:
            get_files("test", subpath)
        self.assertEqual(error.exception.status_code, expected)

    def test_internal_entries_are_hidden_but_project_files_remain(self):
        for name in (".git", ".github", "venv", "env", "node_modules", "__pycache__"):
            (self.root / name).mkdir()
        for name in (".gitignore", ".env", ".env.local", "production.env"):
            (self.root / name).touch()
        for name in ("README.md", "environment.md", "envoy.conf"):
            (self.root / name).touch()
        (self.root / "src").mkdir()

        items = get_files("test")["items"]
        self.assertEqual(
            [item["name"] for item in items],
            ["src", "environment.md", "envoy.conf", "README.md"],
        )

    def test_filter_applies_inside_projects(self):
        project = self.root / "project"
        project.mkdir()
        (project / ".venv").mkdir()
        (project / ".pytest_cache").mkdir()
        (project / "ENV").mkdir()
        (project / "main.py").touch()
        self.assertEqual(
            [item["name"] for item in get_files("test", "project")["items"]],
            ["main.py"],
        )

    def test_hidden_paths_cannot_be_requested_directly(self):
        (self.root / ".git" / "objects").mkdir(parents=True)
        (self.root / "venv" / "lib").mkdir(parents=True)
        (self.root / "src").mkdir()
        (self.root / ".env").touch()
        for subpath in (".git", ".git/objects", "venv/lib", ".env", ".git/../src"):
            with self.subTest(subpath=subpath):
                self.assert_status(subpath, 404)

    def test_symlinks_cannot_reveal_excluded_targets(self):
        hidden = self.root / ".git"
        hidden.mkdir()
        outside = self.base / "outside"
        outside.mkdir()
        visible = self.root / "src"
        visible.mkdir()
        (self.root / "git-alias").symlink_to(hidden, target_is_directory=True)
        (self.root / "outside-alias").symlink_to(outside, target_is_directory=True)
        (self.root / "source-alias").symlink_to(visible, target_is_directory=True)
        (self.root / "loop").symlink_to("loop")

        self.assertEqual(
            [item["name"] for item in get_files("test")["items"]],
            ["source-alias", "src"],
        )
        self.assert_status("git-alias", 404)
        self.assert_status("outside-alias", 403)
        self.assert_status("loop", 404)
        self.assertEqual(get_files("test", "source-alias")["items"], [])

    def test_existing_path_validation_is_preserved(self):
        (self.root / "README.md").touch()
        self.assert_status("../outside", 403)
        self.assert_status("missing", 404)
        self.assert_status("README.md", 400)
        with self.assertRaises(HTTPException) as error:
            get_files("unknown")
        self.assertEqual(error.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
