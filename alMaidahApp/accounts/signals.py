from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import ensure_user_profile


@receiver(post_save, sender=User)
def create_or_update_user_profile(sender, instance, **kwargs):
    ensure_user_profile(instance)

