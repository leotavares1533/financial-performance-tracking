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

    def build(self,adjustment,manual_events=None,position_date='2026-11-10'):
        with patch.object(imp,'load_synthetic_titles',return_value=[adjustment]), patch.object(imp,'load_manual_adjustments',return_value=manual_events or []):
            return imp.build_import(Path('fixture.csv'),position_date,rows=[copy.deepcopy(self.row)],unified=True)['operations'][0]

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

    def test_non_cash_substitution_is_neutral_at_d0(self):
        event=dict(id='reconciliacao-teste',operationId='confina-cra-65-200',date='2026-11-04',
                   titleId='grupo-substituicao',type='synthetic_adjustment',amount=-1332825.98,mode='replace_same_day')
        op=self.build(self.adjustment,[event],'2026-11-04')
        self.assertEqual(len(op['titles']),1)
        self.assertEqual(op['titles'][0]['presentValue'],1332825.98)
        self.assertEqual(op['manualAdjustments']['cashImpact'],0)
        self.assertEqual(op['manualAdjustments']['syntheticImpact'],-1332825.98)
        self.assertEqual(sum(t['presentValue'] for t in op['titles'])+sum(e['amount'] for e in op['cashEvents']),0)

    def test_reimport_does_not_duplicate_opening_offset(self):
        event=dict(id='reconciliacao-teste',operationId='confina-cra-65-200',date='2026-11-04',
                   titleId='grupo-substituicao',type='synthetic_adjustment',amount=-1332825.98,mode='replace_same_day')
        cash=[]
        with patch.object(imp,'load_manual_adjustments',return_value=[event]):
            imp.apply_manual_adjustments('confina-cra-65-200',[],cash)
            imp.apply_manual_adjustments('confina-cra-65-200',[],cash)
        self.assertEqual(len(cash),1)
        self.assertEqual(cash[0]['type'],'synthetic_adjustment')
        self.assertEqual(cash[0]['amount'],-1332825.98)

    def test_signed_cash_regularization_preserves_audit_metadata(self):
        event=dict(id='estorno-teste',operationId='confina-cra-65-200',date='2026-11-04',
                   titleId='485013',type='cash_adjustment',amount=-1046824.34,mode='replace_same_day',
                   reconciliationKind='non_cash_historical_balance_correction',reconciliationId='acordo-teste',
                   sourceEventDate='2026-09-30',bankMovement=False,fundingImpact=0)
        cash=[]
        with patch.object(imp,'load_manual_adjustments',return_value=[event]):
            first=imp.apply_manual_adjustments('confina-cra-65-200',[],cash)
            imp.apply_manual_adjustments('confina-cra-65-200',[],cash)
        self.assertEqual(len(cash),1)
        self.assertEqual(first['cashImpact'],-1046824.34)
        self.assertEqual(first['syntheticImpact'],0)
        for key in ['reconciliationKind','reconciliationId','sourceEventDate','bankMovement','fundingImpact']:
            self.assertEqual(cash[0][key],event[key])

    def test_confession_regularization_keeps_the_open_asset_unchanged(self):
        title=dict(id='542982',purchaseDate='2026-09-30',isActive=True,presentValue=292000,acquisitionValue=287671.86)
        titles=[copy.deepcopy(title)]
        event=dict(id='estorno-compra',operationId='confina-cra-65-200',date='2026-11-04',
                   titleId='542982',type='cash_adjustment',amount=287671.86,mode='replace_same_day')
        cash=[]
        with patch.object(imp,'load_manual_adjustments',return_value=[event]):
            result=imp.apply_manual_adjustments('confina-cra-65-200',titles,cash)
        self.assertEqual(titles,[title])
        self.assertEqual(result['cashImpact'],287671.86)
        self.assertEqual(cash[0]['type'],'cash_adjustment')

    def test_internal_compensation_is_reciprocal_without_cash_or_funding(self):
        events=[dict(id='interno-'+op,operationId=op,date='2026-11-04',titleId='grupo-acordo',
                     type='synthetic_adjustment',amount=amount,mode='replace_same_day')
                for op,amount in [('origem-100',1732214.45),('origem-50',2866047.86),('destino',-4598262.31)]]
        cash=[]
        with patch.object(imp,'load_manual_adjustments',return_value=events):
            impacts=[imp.apply_manual_adjustments(op,[],cash) for op in ['origem-100','origem-50','destino']]
        self.assertEqual(sum(row['cashImpact'] for row in impacts),0)
        self.assertEqual(round(sum(row['syntheticImpact'] for row in impacts),2),0)
        self.assertEqual(round(4248591.58-5257084.64,2),-1008493.06)


if __name__=='__main__':
    unittest.main()
