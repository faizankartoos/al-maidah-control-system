from django.db import models


class Menu(models.Model):
    name = models.CharField(max_length=150)
    category = models.CharField(max_length=100)
    # portion_size = models.PositiveIntegerField()  # number of pieces
    price = models.DecimalField(max_digits=10, decimal_places=2)
    is_available = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # unique_together = ('name', 'category')
        ordering = ['category', 'name']

    def __str__(self):
        return f"{self.name} ({self.category})"
