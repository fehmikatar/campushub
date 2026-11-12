"""French search keywords per rule category.

The structured rules are English paraphrases while students ask in French
(or Tunisian student vocabulary). These keywords are added to the KEYWORD
(BM25) text only, to bridge the two. They are search aids, not policy.
"""

CATEGORY_KEYWORDS_FR = {
    "REG": "règlement de scolarité objet entrée en vigueur",
    "ADM": "admission concours sélection entretien inscription",
    "INS": "inscription report d'inscription annulation remboursement frais de scolarité bureau d'ordre dossier",
    "ORG": "organisation des études semestre calendrier spécialité GI GT GEM GC projet intégré",
    "PRO": "programme des études UE ECUE ECTS crédits stages fiche UE syllabus fiche module cours prérequis catalogue des modules",
    "STU": "régime des études durée de la formation années cycle ingénieur baccalauréat prépa",
    "ECT": "système ECTS crédits coefficient moyenne générale 60 ECTS",
    "EVA": "évaluation contrôle continu CC session principale session de rattrapage calendrier des examens",
    "GRD": "calcul de la moyenne d'un module pondération CC TP projet examen pourcentage note",
    "VAL": "validation des UE validée moyenne 8/20 10/20 compensation validation de crédits projets note",
    "PAS": "passage en année supérieure passer admis admission session principale session de contrôle ECTS non validés crédits antérieurs année précédente cumulés redoublant",
    "RET": "session de rattrapage repasser rattraper module note retenue projets intégrés",
    "REP": "redoublement redoubler redoublant une seule fois modules remise à zéro",
    "EXM": "déroulement des épreuves examen carte d'étudiant retard absence zéro justificatif sortie salle téléphone",
    "FRA": "fraude triche tentative de fraude conseil de discipline sanctions exclusion",
    "INT": "stage stages formation humaine et sociale immersion en entreprise stage ingénieur durée ECTS dépôt rapport journal attestation date limite",
    "PFE": "projet de fin d'études PFE stage PFE durée semaines mois soutenance jury rapport plagiat date limite",
    "DIP": "diplôme d'ingénieur obtention du diplôme conditions B2 français anglais certification quitus prolongation",
    "ATT": "assiduité absence absences présence obligatoire retard justificatif",
    "ETH": "honnêteté intellectuelle plagiat fraude références bibliographiques citation",
    "DIS": "discipline code vestimentaire tenue respect fumer tabac alcool drogue",
    "RGT": "droits de l'étudiant formation de qualité délégués liberté d'expression",
    "DAT": "données personnelles confidentialité protection des données loi 2004-63",
    "RES": "responsabilités de l'étudiant propriété intellectuelle frais respect",
    "SUP": "cellule d'écoute accompagnement soutien stress écoute confidentiel",
    "MAIL": "mailing liste charte anciens",
    "ACK": "engagement signature règlement intérieur",
}


def keywords_for(categories) -> str:
    return " ".join(CATEGORY_KEYWORDS_FR.get(c, "") for c in sorted(set(categories))).strip()
