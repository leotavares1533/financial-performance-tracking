import copy
import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('importer',Path(__file__).with_name('import-confina-portfolio.py'))
imp=importlib.util.module_from_spec(spec)
spec.loader.exec_module(imp)


class SubstitutionTests(unittest.TestCase):
    def setUp(self):
        self.adjustment=dict(type='synthetic_title',titleId='566696',originalLastro='566696',
                             reconcileReported=True,invoice='JD022026-1',cedente='JOSE OSMAR DENIPOTI',
                             sacado='JOSE OSMAR DENIPOTI',purchaseDate='2026-11-04',maturityDate='2027-08-23',
                             acquisitionValue=1332825.98,faceValue=1631642.03,monthlyRate=.017,
                             cashPurchaseAmount=0)
        self.row={'Nome CRA':'65a - Confina CRA','Lastro':'569101','Numero NF':'JD022026','Parcela':'1',
                  'Nome da cedente':'JOSE OSMAR DENIPOTI','Nome sacado':'JOSE OSMAR DENIPOTI',
                  'Valor face':'1631642,03','Valor aquisicao':'1332825,98','Taxa desconto':'1,7',
                  'Data de cessao':'28/08/2026','Data de vencimento':'23/08/2027',
                  'Status do titulo':'EM CARTEIRA','Status do Pagamento':'VINCENDO','Valor pago':'0'}

    def build(self,adjustment):
        with patch.object(imp,'load_synthetic_titles',return_value=[adjustment]), patch.object(imp,'load_manual_adjustments',return_value=[]):
            return imp.build_import(Path('fixture.csv'),'2026-11-10',rows=[copy.deepcopy(self.row)],unified=True)['operations'][0]

    def test_reconciled_substitution_keeps_value_without_purchase_cash(self):
        op=self.build(self.adjustment)
        self.assertEqual(len(op['titles']),1)
        title=op['titles'][0]
        self.assertEqual(title['id'],'569101')
        self.assertEqual(title['purchaseDate'],'2026-11-04')
        self.assertEqual(title['acquisitionValue'],1332825.98)
        self.assertEqual(title['cashPurchaseAmount'],0)
        self.assertGreater(title['presentValue'],1332825.98)
        self.assertFalse(any(e['type']=='portfolio_purchase' for e in op['cashEvents']))

    def test_ordinary_purchase_still_uses_acquisition_amount(self):
        adjustment=copy.deepcopy(self.adjustment)
        del adjustment['cashPurchaseAmount']
        op=self.build(adjustment)
        purchases=[e for e in op['cashEvents'] if e['type']=='portfolio_purchase']
        self.assertEqual(len(purchases),1)
        self.assertEqual(purchases[0]['amount'],1332825.98)

    def test_synthetic_substitution_explicit_zero(self):
        title=imp.synthetic_title_from_adjustment(self.adjustment,'confina-cra-65-200','2026-11-10')
        self.assertEqual(title['cashPurchaseAmount'],0)
        self.assertGreater(title['presentValue'],0)
        title=imp.synthetic_title_from_adjustment({k:v for k,v in self.adjustment.items() if k!='cashPurchaseAmount'},'confina-cra-65-200','2026-11-10')
        self.assertEqual(title['cashPurchaseAmount'],1332825.98)

    def test_new_export_cannot_silently_replace_closed_history(self):
        with patch.object(imp,'read_csv',return_value=[{'Veículo':'Confina BTG 100 MM','Lastro':'558701'}]):
            with self.assertRaisesRegex(ValueError,'reconciliacao incremental'):
                imp.import_source(Path('novo-ger004.csv'),'2026-11-10')

    def test_shared_lastro_remains_distinct_between_origin_and_buyer(self):
        bio_spec=importlib.util.spec_from_file_location('bio',Path(__file__).with_name('build-biological-assets-confina.py'))
        bio=importlib.util.module_from_spec(bio_spec)
        bio_spec.loader.exec_module(bio)
        titles=[dict(id='558701',operationId='confina-cprf-50',isActive=False),
                dict(id='558701',operationId='confina-cra-42-novembro',isActive=True),
                dict(id='566696',operationId='confina-cra-65-200',sourceLastro='569101',isActive=True)]
        by_id,_=bio.make_title_indexes(titles)
        self.assertEqual(len(bio.unique_titles(by_id['558701'])),2)
        self.assertEqual([t['operationId'] for t in bio.unique_titles(by_id['558701']) if bio.active_title(t)],
                         ['confina-cra-42-novembro'])
        self.assertEqual(bio.unique_titles(by_id['569101'])[0]['id'],'566696')


if __name__=='__main__':
    unittest.main()
