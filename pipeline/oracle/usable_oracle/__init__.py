"""usable_oracle: a pure-Python rule system that checks the arithmetic of a floor plan (sizes, walls, openings, furniture). No models, no network, standard library only.

A model (Grounded-SAM and Grounding DINO for the pictures, a language model for words) may propose what a plan contains; the rules here decide whether the numbers hold.
"""
from .rules import RULES, Violation, check_case  # noqa: F401
