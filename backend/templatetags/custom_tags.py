from django import template

register = template.Library()

@register.filter(name='instanceof')
def instanceof(obj, class_name):
    return obj.__class__.__name__ == class_name
