from django import template

register = template.Library()

@register.filter(name='attr')
def attr(field, css):
    key, value = css.split(":", 1)
    return field.as_widget(attrs={key: value})

@register.filter(name='add_placeholder')
def add_placeholder(field, text):
    return field.as_widget(attrs={'placeholder': text})