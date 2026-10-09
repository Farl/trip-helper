"""Behavior tests: real decoded photos must not pass as sharp fullscreen cards merely because URLs load."""
import importlib.util,json,pathlib,tempfile,unittest
from PIL import Image
MODULE=pathlib.Path(__file__).with_name('review_media.py')
if MODULE.exists():
 spec=importlib.util.spec_from_file_location('review_media',MODULE);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);audit_image=module.audit_image
 audit_pack=getattr(module,'audit_pack',lambda pack,records,policy:{'passed':True})
else:
 # Before the quality gate exists, the existing workflow accepts schema-valid media.
 audit_image=lambda record,policy: {'passed':True,'reasons':[]}
 audit_pack=lambda pack,records,policy:{'passed':True}
POLICY={'minLongEdge':1200,'minShortEdge':800,'minVisibleWidth':450,'minVisibleHeight':800,'viewport':{'width':420,'height':746}}
class MediaGateTests(unittest.TestCase):
 def setUp(self): self.directory=tempfile.TemporaryDirectory()
 def tearDown(self): self.directory.cleanup()
 def record(self,size,**changes):
  p=pathlib.Path(self.directory.name)/'source.jpg';Image.new('RGB',size,color='blue').save(p)
  return {'cardId':'example','path':str(p),'url':'https://example.com/photo.jpg','selectedUrl':'https://example.com/photo.jpg','representative':True,'cropRepresentative':True,'sharpnessReviewed':True,'notUpscaled':True,'inspection':'Actual object and center crop inspected','sourceEvidence':'Original file linked on the venue page','seasonEvidence':'Architecture photo; filming month unknown and foliage not promised',**changes}
 def test_pack_cannot_pass_when_a_selected_still_has_no_review(self):
  self.assertFalse(audit_pack({'cards':[{'id':'missing','image':{'url':'https://example.com/selected.jpg'}}]},[],POLICY)['passed'])
 def test_review_is_bound_to_real_card_url_not_self_reported_url(self):
  record=self.record((1600,1000))
  self.assertFalse(audit_pack({'cards':[{'id':'example','image':{'url':'https://example.com/unreviewed.jpg'}}]},[record],POLICY)['passed'])
 def test_small_source_images_rejected_even_when_representative(self):
  for size in [(200,133),(279,190),(360,240)]: self.assertFalse(audit_image(self.record(size),POLICY)['passed'],size)
 def test_natural_landscape_has_enough_pixels_in_the_visible_crop(self): self.assertTrue(audit_image(self.record((1600,1000)),POLICY)['passed'])
 def test_large_file_does_not_hide_nonrepresentative_crop(self): self.assertFalse(audit_image(self.record((2400,1600),cropRepresentative=False),POLICY)['passed'])
 def test_review_must_bind_to_the_selected_original(self): self.assertFalse(audit_image(self.record((1600,1000),selectedUrl='https://example.com/other.jpg'),POLICY)['passed'])
 def test_unreviewed_or_upscaled_asset_is_not_a_pass(self):
  self.assertFalse(audit_image(self.record((1600,1000),notUpscaled=False),POLICY)['passed'])
  self.assertFalse(audit_image(self.record((1600,1000),sharpnessReviewed=False),POLICY)['passed'])
if __name__=='__main__':unittest.main()
