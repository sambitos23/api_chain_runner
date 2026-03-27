"""Unique data generator for fields that must differ per run."""

from __future__ import annotations

import copy
import random
import string
import time
import uuid


class UniqueDataGenerator:
    """Generates unique values for email, PAN, and mobile fields.

    Each call produces a distinct value with high probability via
    timestamp/UUID suffixes (email) or random generation (PAN, mobile).

    Users can register custom generators via :meth:`register_generator`
    and use them in YAML ``unique_fields`` by name.
    """

    # Fourth character of a PAN encodes the entity type.
    _PAN_FOURTH_CHARS = "PCHFAT"

    def __init__(self) -> None:
        self._custom_generators: dict[str, callable] = {}

    def generate_email(self, base: str = "user") -> str:
        """Generate a unique RFC-valid email address.

        Uses a combination of timestamp and a short UUID fragment to
        guarantee uniqueness across runs.

        Args:
            base: Local-part prefix (default ``"user"``).

        Returns:
            An email string like ``"user_1718901234_a1b2c3@test.com"``.
        """
        ts = int(time.time())
        uid = uuid.uuid4().hex[:6]
        return f"{base}_{ts}_{uid}@test.com"

    def generate_pan(self, fourth_char: str | None = None) -> str:
        """Generate a valid-format Indian PAN number.

        Format: ``[A-Z]{3}[PCHFAT][A-Z][0-9]{4}[A-Z]``

        The fourth character is one of P (individual), C (company),
        H (HUF), F (firm), A (AOP), or T (trust).

        Args:
            fourth_char: Explicit fourth character (e.g. ``"P"``, ``"C"``).
                If ``None``, a random character from ``PCHFAT`` is used.

        Returns:
            A 10-character PAN string.
        """
        first_three = "".join(random.choices(string.ascii_uppercase, k=3))
        if fourth_char and fourth_char.upper() in self._PAN_FOURTH_CHARS:
            fourth = fourth_char.upper()
        else:
            fourth = random.choice(self._PAN_FOURTH_CHARS)
        fifth = random.choice(string.ascii_uppercase)
        digits = "".join(random.choices(string.digits, k=4))
        last = random.choice(string.ascii_uppercase)
        return f"{first_three}{fourth}{fifth}{digits}{last}"

    def generate_mobile(self) -> str:
        """Generate a 10-digit Indian mobile number.

        Indian mobile numbers start with a digit in the range 6-9,
        followed by 9 random digits.

        Returns:
            A 10-digit numeric string.
        """
        first = str(random.randint(6, 9))
        rest = "".join(random.choices(string.digits, k=9))
        return f"{first}{rest}"

    def generate_udyam(self) -> str:
        """Generate a valid-format UDYAM registration number.

        Format: ``UDYAM-XX-99-9999999`` where X is an uppercase letter
        and 9 is a random digit.

        Returns:
            A UDYAM string like ``"UDYAM-KA-23-1234567"``.
        """
        letters = string.ascii_uppercase
        return (
            "UDYAM-"
            + random.choice(letters)
            + random.choice(letters)
            + "-"
            + str(random.randint(10, 99))
            + "-"
            + str(random.randint(1000000, 9999999))
        )

    def register_generator(self, name: str, func: callable) -> None:
        """Register a custom generator function.

        The function must accept no arguments and return a string.
        Once registered, the name can be used in YAML ``unique_fields``.

        Args:
            name: Generator name to use in YAML (e.g. ``"name"``, ``"address"``).
            func: A callable that takes no args and returns a ``str``.

        Raises:
            ValueError: If *name* conflicts with a built-in generator.

        Example::

            from api_chain_runner import ChainRunner

            runner = ChainRunner("my_chain.yaml")
            runner.generator.register_generator(
                "name", lambda: random.choice(["Alice", "Bob", "Charlie"])
            )
            result = runner.run()
        """
        builtins = {"email", "pan", "mobile", "udyam"}
        if name in builtins:
            raise ValueError(
                f"Cannot override built-in generator '{name}'. "
                f"Built-ins: {', '.join(sorted(builtins))}"
            )
        self._custom_generators[name] = func

    def apply(self, payload: dict, unique_fields: dict[str, str]) -> dict:
        """Apply generated unique values to specified payload paths.

        Creates a deep copy of *payload*, then for each entry in
        *unique_fields* generates a value and sets it at the
        dot-notation path.

        Args:
            payload: The original request body dict.
            unique_fields: Mapping of ``"dotted.path"`` to generator
                type (``"email"``, ``"pan"``, or ``"mobile"``).

        Returns:
            A new dict with unique values injected. The original
            *payload* is never mutated.
        """
        result = copy.deepcopy(payload)

        generators = {
            "email": self.generate_email,
            "pan": self.generate_pan,
            "mobile": self.generate_mobile,
            "udyam": self.generate_udyam,
            **self._custom_generators,
        }

        for field_path, gen_type in unique_fields.items():
            # Support pan-p, pan-c etc. to control the fourth character
            if gen_type.startswith("pan-") and len(gen_type) == 5:
                value = self.generate_pan(fourth_char=gen_type[-1])
            elif gen_type in generators:
                value = generators[gen_type]()
            else:
                raise ValueError(
                    f"Unknown generator type '{gen_type}' for field '{field_path}'. "
                    f"Available: {', '.join(sorted(generators.keys()))}"
                )
            keys = field_path.split(".")
            target = result

            for key in keys[:-1]:
                target = target[key]

            target[keys[-1]] = value

        return result
