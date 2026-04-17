"""Safety checker for code changes"""
import os
import re

FORBIDDEN_IMPORTS = [
    'requests',
    'subprocess',
    'eval',
    'exec',
    '__import__'
]

FORBIDDEN_FILES = {
    'bitget_client.py',
    'risk.py',
    'database.py'
}

class SafetyChecker:
    @staticmethod
    def check_code_change(file_path, content):
        """Check if code change is safe"""
        errors = []

        for forbidden in FORBIDDEN_IMPORTS:
            if f'import {forbidden}' in content or f'from {forbidden}' in content:
                errors.append(f"Forbidden import: {forbidden}")

        if re.search(r'(sk_|pk_|api_key\s*=\s*["\'][^"\']{20,}["\'])', content):
            errors.append("Hard-coded credentials detected")

        if re.search(r'requests\.(?:get|post|put|delete)\(["\']http', content):
            errors.append("Unapproved network call")

        return {'safe': len(errors) == 0, 'errors': errors}

safety = SafetyChecker()
