from django import template

register = template.Library()

@register.filter
def animation_delay(forloop_counter, base_delay_str):
    """
    Calculates an animation delay for a loop item.
    forloop_counter: The current value of forloop.counter (1-indexed).
    base_delay_str: The base delay as a string (e.g., "0.8").
    """
    try:
        # Convert base_delay_str to float
        base_delay = float(base_delay_str)
        # Calculate delay: base_delay + (counter - 1) * 0.1s (or whatever increment you prefer)
        # Using 0.1s increment for each subsequent item
        delay = base_delay + (forloop_counter - 1) * 0.1
        return f"{delay}s"
    except (ValueError, TypeError):
        # Fallback if conversion fails, or if forloop_counter is not a number
        return "0s" # Default to no delay if calculation fails


register = template.Library()

@register.filter(name='instanceof')
def instanceof(obj, class_name):
    return obj.__class__.__name__ == class_name
