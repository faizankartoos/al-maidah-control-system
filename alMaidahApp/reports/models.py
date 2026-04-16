from django.db import models


class LocationInsightCache(models.Model):
    normalized_label = models.CharField(max_length=120, unique=True)
    display_label = models.CharField(max_length=120)
    latitude = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    resolved_query = models.CharField(max_length=255, blank=True, default="")
    source = models.CharField(max_length=40, blank=True, default="nominatim")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["display_label"]

    def __str__(self):
        return self.display_label
