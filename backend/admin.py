from django.contrib import admin
from .models import AssessmentResult  # ✅ Import your model
from .models import SpiralAssessmentResult # ✅ Import your model
# ✅ Register the model
@admin.register(AssessmentResult)
class AssessmentResultAdmin(admin.ModelAdmin):
    list_display = (
        'user', 'predicted_stage', 'created_at'
    )
    list_filter = ('predicted_stage', 'created_at')
    search_fields = ('user__username', 'predicted_stage')
    ordering = ('-created_at',)

@admin.register(SpiralAssessmentResult)
class SpiralAssessmentResultAdmin(admin.ModelAdmin):
    list_display = ('user', 'result', 'created_at')
    list_filter = ('result', 'created_at')
    search_fields = ('user__username', 'result')
    ordering = ('-created_at',)
