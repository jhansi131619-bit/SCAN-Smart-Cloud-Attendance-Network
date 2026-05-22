import os
import urllib.request

models_dir = 'models'
if not os.path.exists(models_dir):
    os.makedirs(models_dir)

prototxt_url = 'https://raw.githubusercontent.com/opencv/opencv/master/samples/dnn/face_detector/deploy.prototxt'
caffemodel_url = 'https://raw.githubusercontent.com/opencv/opencv_3rdparty/dnn_samples_face_detector_20170830/res10_300x300_ssd_iter_140000.caffemodel'

print("Downloading deploy.prototxt...")
urllib.request.urlretrieve(prototxt_url, os.path.join(models_dir, 'deploy.prototxt'))

print("Downloading res10_300x300_ssd_iter_140000.caffemodel...")
urllib.request.urlretrieve(caffemodel_url, os.path.join(models_dir, 'res10_300x300_ssd_iter_140000.caffemodel'))

print("Downloads complete.")
