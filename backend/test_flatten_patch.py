import tensorflow as tf

class CustomFlatten(tf.keras.layers.Flatten):
    def call(self, inputs, *args, **kwargs):
        if isinstance(inputs, list):
            inputs = inputs[0]
        return super().call(inputs, *args, **kwargs)

try:
    print("Trying to load with CustomFlatten...")
    model = tf.keras.models.load_model('spiral_model.h5', custom_objects={'Flatten': CustomFlatten})
    print("SUCCESS! Output shape:", model.output_shape)
except Exception as e:
    print("FAILED:", e)
