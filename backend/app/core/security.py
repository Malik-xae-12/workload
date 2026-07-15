import re


def validate_password_rules(password: str, email: str | None = None) -> list[str]:
    errors: list[str] = []

    if len(password) < 8:
        errors.append("Password should be at least 8 characters.")
    if email and email in password:
        errors.append("Password should not contain e-mail.")
    if not any(char.isupper() for char in password):
        errors.append("Password should contain at least one uppercase letter.")
    if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
        errors.append("Password should contain at least one special character.")

    return errors
