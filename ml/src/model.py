"""U-Net flood segmentation model and masked BCE + Dice loss."""

from __future__ import annotations

import segmentation_models_pytorch as smp
import torch
import torch.nn as nn
import torch.nn.functional as F

from ml import config


def build_unet(
    encoder_name: str = config.ENCODER_NAME,
    encoder_weights: str | None = config.ENCODER_WEIGHTS,
    in_channels: int = config.IN_CHANNELS,
    classes: int = config.OUT_CHANNELS,
) -> nn.Module:
    """Create a 2-channel Sentinel-1 U-Net with a pretrained ResNet-34 backbone."""
    return smp.Unet(
        encoder_name=encoder_name,
        encoder_weights=encoder_weights,
        in_channels=in_channels,
        classes=classes,
    )


class MaskedBCEDiceLoss(nn.Module):
    """Combined BCEWithLogits + soft Dice loss evaluated strictly on valid pixels (target != -1)."""

    def __init__(self, ignore_index: int = config.IGNORE_INDEX, bce_weight: float = 0.5, smooth: float = 1.0) -> None:
        super().__init__()
        self.ignore_index = ignore_index
        self.bce_weight = bce_weight
        self.smooth = smooth

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        """Compute masked BCE + Dice loss.

        Args:
            logits: Model output tensor of shape (B, 1, H, W).
            targets: Integer label tensor of shape (B, H, W) with values in {-1, 0, 1}.
        """
        logits_flat = logits.squeeze(1)
        valid_mask = targets != self.ignore_index
        if not valid_mask.any():
            return logits_flat.sum() * 0.0

        valid_logits = logits_flat[valid_mask]
        valid_targets = targets[valid_mask].float()

        bce = F.binary_cross_entropy_with_logits(valid_logits, valid_targets)

        probs = torch.sigmoid(valid_logits)
        intersection = (probs * valid_targets).sum()
        denom = probs.sum() + valid_targets.sum()
        dice_loss = 1.0 - (2.0 * intersection + self.smooth) / (denom + self.smooth)

        return self.bce_weight * bce + (1.0 - self.bce_weight) * dice_loss
